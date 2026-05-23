import os
import requests
from dotenv import load_dotenv

load_dotenv()

GEMINI_MODELS = [
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-pro",
]

def _init_gemini(model: str):
    from langchain_google_genai import ChatGoogleGenerativeAI

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not set in your .env file.")

    return ChatGoogleGenerativeAI(
        model=model,
        google_api_key=api_key,
        temperature=0.1,
    )

def _init_groq(model: str):
    from langchain_groq import ChatGroq

    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY is not set in your .env file.")

    return ChatGroq(
        model=model,
        groq_api_key=api_key,
        temperature=0.1,
    )

def _init_ollama(model: str):
    from langchain_ollama import ChatOllama

    return ChatOllama(
        model=model,
        temperature=0.1,
    )

def init_llm(provider: str, model: str):
    provider = provider.lower().strip()

    if provider == "gemini":
        return _init_gemini(model)
    elif provider == "groq":
        return _init_groq(model)
    elif provider == "ollama":
        return _init_ollama(model)
    else:
        raise ValueError(f"Unknown provider '{provider}'")

def get_gemini_models():
    return GEMINI_MODELS

def get_groq_models():
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY is not set in your .env file.")

    url = "https://api.groq.com/openai/v1/models"
    headers = {
        "Authorization": f"Bearer {api_key}",
    }

    response = requests.get(url, headers=headers)
    data = response.json()

    return [m["id"] for m in data.get("data", [])]

def get_ollama_models():
    try:
        response = requests.get("http://localhost:11434/api/tags")
        data = response.json()
        return [m["name"] for m in data.get("models", [])]
    except:
        raise ValueError("Ollama is not running")

def get_models_for_provider(provider: str):
    provider = provider.lower().strip()

    if provider == "gemini":
        return get_gemini_models()
    elif provider == "groq":
        return get_groq_models()
    elif provider == "ollama":
        return get_ollama_models()
    else:
        raise ValueError(f"Unknown provider '{provider}'")