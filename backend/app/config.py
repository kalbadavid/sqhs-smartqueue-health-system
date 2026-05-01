from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite:///./sqhs.db"
    model_dir: str = "../model"
    cors_origins: str = "http://localhost:5173"
    seed_on_startup: bool = True

    sms_provider: str = "stub"
    at_username: str | None = None
    at_api_key: str | None = None
    at_sender_id: str | None = None

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

settings = Settings()
