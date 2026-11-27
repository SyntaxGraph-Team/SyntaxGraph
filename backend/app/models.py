from dataclasses import dataclass, field
from typing import Literal
from pydantic import BaseModel

NodeKind = Literal["File", "Class", "Function", "Method", "Interface"]
EdgeKind = Literal["CONTAINS", "IMPORTS", "CALLS", "INHERITS"]


@dataclass(slots=True)
class ASTNode:
    node_id: str
    repo_id: str
    kind: NodeKind
    name: str
    file_path: str
    start_line: int
    end_line: int
    signature: str = ""
    docstring: str = ""
    raw_code: str = ""


@dataclass(slots=True)
class ASTEdge:
    repo_id: str
    source_id: str
    target_id: str
    kind: EdgeKind


@dataclass(slots=True)
class ParseResult:
    nodes: list[ASTNode] = field(default_factory=list)
    edges: list[ASTEdge] = field(default_factory=list)
    files_parsed: int = 0


class IngestRequest(BaseModel):
    repo_url: str
    repo_id: str | None = None
    branch: str = "main"


class QueryRequest(BaseModel):
    repo_id: str
    query: str
    top_k: int = 5


class EvalRequest(BaseModel):
    use_live_stores: bool = False
    use_llm: bool = False
