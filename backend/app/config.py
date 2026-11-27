from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    gemini_embed_model: str = "gemini-embedding-001"

    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "syntaxgraph_pass"

    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str = ""
    qdrant_collection: str = "syntaxgraph_nodes"

    github_token: str = ""
    github_webhook_secret: str = ""

    firebase_project_id: str = ""
    firebase_credentials_path: str = ""
    auth_disabled: bool = True

    repos_dir: str = "./repos_cache"


@lru_cache
def get_settings() -> Settings:
    return Settings()
