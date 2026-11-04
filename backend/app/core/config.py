from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_name: str = 'Panda Fashion API'
    database_url: str = 'mysql+pymysql://panda:panda@localhost:3307/panda_fashion'
    secret_key: str = 'change-this-in-production'
    access_token_expire_minutes: int = 1440
    frontend_origin: str = 'http://localhost:5173'
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')

settings = Settings()
