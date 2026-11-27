from pathlib import Path
from collections import defaultdict
from tree_sitter import Language, Parser, Node
import tree_sitter_python as tspython
import tree_sitter_javascript as tsjs
import tree_sitter_typescript as tsts
import tree_sitter_cpp as tscpp
from .models import ASTEdge, ASTNode, ParseResult

IGNORED_DIRS = {".git", "node_modules", ".venv", "venv", "dist", "build", "__pycache__", ".next", "target"}
IGNORED_SUFFIXES = (".min.js", ".min.css", ".lock", ".map")
IGNORED_FILES = {"package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock", "Cargo.lock"}
MAX_FILE_BYTES = 512_000

_LANGUAGES: dict[str, Language] = {
    ".py": Language(tspython.language()),
    ".js": Language(tsjs.language()),
    ".jsx": Language(tsjs.language()),
    ".ts": Language(tsts.language_typescript()),
    ".tsx": Language(tsts.language_tsx()),
    ".cpp": Language(tscpp.language()),
    ".cc": Language(tscpp.language()),
    ".hpp": Language(tscpp.language()),
    ".h": Language(tscpp.language()),
}

_PARSERS: dict[str, Parser] = {ext: Parser(lang) for ext, lang in _LANGUAGES.items()}

_CLASS_TYPES = {"class_definition", "class_declaration", "class_specifier", "struct_specifier"}
_IFACE_TYPES = {"interface_declaration"}
_FUNC_TYPES = {"function_definition", "function_declaration", "method_definition", "arrow_function"}
_IMPORT_TYPES = {"import_statement", "import_from_statement", "preproc_include"}
_CALL_TYPES = {"call", "call_expression"}


def _text(node: Node, src: bytes) -> str:
    return src[node.start_byte : node.end_byte].decode("utf-8", errors="replace")


def _child_by_field(node: Node, field: str, src: bytes) -> str:
    c = node.child_by_field_name(field)
    return _text(c, src) if c else ""


def _first_ident(node: Node | None, src: bytes) -> str:
    if node is None:
        return ""
    if node.type in {"identifier", "type_identifier", "property_identifier", "field_identifier"}:
        return _text(node, src)
    for child in node.children:
        if child.type in {"identifier", "type_identifier", "property_identifier", "field_identifier"}:
            return _text(child, src)
    for child in node.children:
        res = _first_ident(child, src)
        if res:
            return res
    return ""


def _extract_bases(node: Node, src: bytes) -> list[str]:
    bases: list[str] = []
    for child in node.children:
        if child.type in {"argument_list", "class_heritage", "extends_clause", "implements_clause", "base_class_clause"}:
            for sub in child.children:
                if sub.type in {"identifier", "type_identifier"}:
                    bases.append(_text(sub, src))
                elif sub.type in {"attribute", "extends_type_clause"}:
                    ident = _first_ident(sub, src)
                    if ident:
                        bases.append(ident)
    return bases


def _extract_docstring(node: Node, src: bytes) -> str:
    body = node.child_by_field_name("body")
    if body and body.children:
        first = body.children[0]
        if first.type == "expression_statement" and first.children and first.children[0].type == "string":
            return _text(first.children[0], src).strip("\"' \n")[:300]
    return ""


def _should_skip(path: Path) -> bool:
    if any(p in IGNORED_DIRS for p in path.parts):
        return True
    name = path.name
    return name in IGNORED_FILES or name.endswith(IGNORED_SUFFIXES)


def collect_repo_files(repo_root: Path) -> list[Path]:
    files: list[Path] = []
    for p in repo_root.rglob("*"):
        if p.is_file() and p.suffix.lower() in _PARSERS and not _should_skip(p):
            if p.stat().st_size <= MAX_FILE_BYTES:
                files.append(p)
    return files


def parse_files(repo_root: Path, repo_id: str, file_paths: list[Path] | None = None) -> ParseResult:
    targets = file_paths if file_paths is not None else collect_repo_files(repo_root)
    nodes: list[ASTNode] = []
    edges: list[ASTEdge] = []

    raw_calls: list[tuple[str, str]] = []
    raw_imports: list[tuple[str, str]] = []
    raw_inherits: list[tuple[str, str]] = []

    symbol_index: dict[str, list[str]] = defaultdict(list)
    file_index: dict[str, str] = {}
    parsed_count = 0

    for path in targets:
        ext = path.suffix.lower()
        parser = _PARSERS.get(ext)
        if not parser or not path.is_file():
            continue
        parsed_count += 1
        src = path.read_bytes()
        rel_path = path.relative_to(repo_root).as_posix()
        file_id = f"{repo_id}:{rel_path}"
        lines = src.count(b"\n") + 1
        nodes.append(
            ASTNode(
                node_id=file_id,
                repo_id=repo_id,
                kind="File",
                name=path.name,
                file_path=rel_path,
                start_line=1,
                end_line=lines,
                signature=rel_path,
                raw_code=src[:4000].decode("utf-8", errors="replace"),
            )
        )
        file_index[rel_path] = file_id
        file_index[path.stem] = file_id

        tree = parser.parse(src)
        stack: list[tuple[Node, str, str | None]] = [(tree.root_node, file_id, None)]

        while stack:
            cur, parent_id, class_name = stack.pop()
            ctype = cur.type
            next_parent = parent_id
            next_class = class_name

            if ctype in _CLASS_TYPES or ctype in _IFACE_TYPES:
                name = _child_by_field(cur, "name", src) or _first_ident(cur, src)
                if name:
                    kind = "Interface" if ctype in _IFACE_TYPES else "Class"
                    nid = f"{repo_id}:{rel_path}:{name}:{cur.start_point.row + 1}"
                    sig_line = _text(cur, src).splitlines()[0][:200]
                    nodes.append(
                        ASTNode(
                            node_id=nid,
                            repo_id=repo_id,
                            kind=kind,
                            name=name,
                            file_path=rel_path,
                            start_line=cur.start_point.row + 1,
                            end_line=cur.end_point.row + 1,
                            signature=sig_line,
                            docstring=_extract_docstring(cur, src),
                            raw_code=_text(cur, src)[:4000],
                        )
                    )
                    edges.append(ASTEdge(repo_id=repo_id, source_id=file_id, target_id=nid, kind="CONTAINS"))
                    symbol_index[name].append(nid)
                    for base in _extract_bases(cur, src):
                        raw_inherits.append((nid, base))
                    next_parent = nid
                    next_class = name

            elif ctype in _FUNC_TYPES:
                name = _child_by_field(cur, "name", src)
                if not name and cur.parent and cur.parent.type == "variable_declarator":
                    name = _child_by_field(cur.parent, "name", src)
                if not name and ext in {".cpp", ".cc", ".hpp", ".h"}:
                    decl = cur.child_by_field_name("declarator")
                    name = _first_ident(decl, src)
                if name:
                    kind = "Method" if class_name else "Function"
                    qual = f"{class_name}.{name}" if class_name else name
                    nid = f"{repo_id}:{rel_path}:{qual}:{cur.start_point.row + 1}"
                    sig_line = _text(cur, src).splitlines()[0][:200]
                    nodes.append(
                        ASTNode(
                            node_id=nid,
                            repo_id=repo_id,
                            kind=kind,
                            name=name,
                            file_path=rel_path,
                            start_line=cur.start_point.row + 1,
                            end_line=cur.end_point.row + 1,
                            signature=sig_line,
                            docstring=_extract_docstring(cur, src),
                            raw_code=_text(cur, src)[:4000],
                        )
                    )
                    edges.append(ASTEdge(repo_id=repo_id, source_id=parent_id, target_id=nid, kind="CONTAINS"))
                    symbol_index[name].append(nid)
                    symbol_index[qual].append(nid)
                    next_parent = nid

            elif ctype in _IMPORT_TYPES:
                imp_text = _text(cur, src)
                for token in imp_text.replace("from ", "").replace("import ", "").replace('"', " ").replace("'", " ").replace(";", " ").split():
                    cleaned = token.strip(".,{}()<>")
                    if cleaned and cleaned not in {"as", "#include"}:
                        raw_imports.append((file_id, cleaned))

            elif ctype in _CALL_TYPES and parent_id != file_id:
                fn_node = cur.child_by_field_name("function") or (cur.children[0] if cur.children else None)
                callee = _text(fn_node, src).split(".")[-1].split("::")[-1].strip() if fn_node else ""
                if callee and callee.isidentifier():
                    raw_calls.append((parent_id, callee))

            for child in reversed(cur.children):
                stack.append((child, next_parent, next_class))

    seen_edges: set[tuple[str, str, str]] = {(e.source_id, e.target_id, e.kind) for e in edges}

    def _add_edge(src_id: str, tgt_id: str, kind: str) -> None:
        if src_id != tgt_id and (src_id, tgt_id, kind) not in seen_edges:
            seen_edges.add((src_id, tgt_id, kind))
            edges.append(ASTEdge(repo_id=repo_id, source_id=src_id, target_id=tgt_id, kind=kind))  # type: ignore[arg-type]

    for src_id, callee in raw_calls:
        for tgt_id in symbol_index.get(callee, ()):
            _add_edge(src_id, tgt_id, "CALLS")

    for src_id, base in raw_inherits:
        for tgt_id in symbol_index.get(base, ()):
            _add_edge(src_id, tgt_id, "INHERITS")

    for src_id, mod in raw_imports:
        leaf = mod.split(".")[-1].split("/")[-1]
        tgt_file = file_index.get(leaf) or file_index.get(mod)
        if tgt_file:
            _add_edge(src_id, tgt_file, "IMPORTS")
        for tgt_sym in symbol_index.get(leaf, ()):
            _add_edge(src_id, tgt_sym, "IMPORTS")

    return ParseResult(nodes=nodes, edges=edges, files_parsed=parsed_count)
