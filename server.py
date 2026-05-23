import uvicorn
import asyncio
import uuid
import os
import io
import zipfile
import pathlib

from fastapi import FastAPI, BackgroundTasks, Request, HTTPException, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

# 🔐 Firebase
import firebase_admin
from firebase_admin import credentials, auth

# 🤖 Gemini AI
import google.generativeai as genai

from agent.graph import run_agent, GENERATED_BASE
from agent.llm_providers import get_models_for_provider

# =========================================================
# APP SETUP
# =========================================================

GENERATED_BASE.mkdir(parents=True, exist_ok=True)

app = FastAPI()

# 🔐 Firebase Initialization
cred = credentials.Certificate("firebase-key.json")
firebase_admin.initialize_app(cred)

# 🤖 Gemini API Initialization
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

MAX_PROMPT_LENGTH = 2200

tasks = {}

# =========================================================
# FIREBASE TOKEN VERIFICATION
# =========================================================

def verify_token(request: Request):

    auth_header = request.headers.get("Authorization")

    if not auth_header:
        raise HTTPException(status_code=401, detail="No token")

    try:
        token = auth_header.split(" ")[1]
        decoded = auth.verify_id_token(token)
        return decoded

    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

# =========================================================
# MODEL API
# =========================================================

@app.get("/api/providers/{provider}/models")
async def list_models(provider: str):

    try:

        models = get_models_for_provider(provider)

        return JSONResponse(content={"models": models})

    except ValueError as e:

        return JSONResponse(
            status_code=400,
            content={"error": str(e)}
        )

    except Exception as e:

        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

# =========================================================
# AGENT BACKGROUND TASK
# =========================================================

async def run_agent_background(task_id: str, prompt: str, provider: str, model: str):

    tasks[task_id]["status"] = "running"

    loop = asyncio.get_running_loop()

    def agent_process():

        try:

            def on_update(event):

                if "planner" in event:

                    app_name = event["planner"].get("app_name")
                    project_dir = event["planner"].get("project_dir")

                    if app_name:

                        tasks[task_id]["logs"].append(
                            f'🏷 App name decided: "{app_name}"'
                        )

                    if project_dir:

                        folder = pathlib.Path(project_dir).name

                        tasks[task_id]["logs"].append(
                            f"📁 Project folder: generated_project/{folder}"
                        )

            meta = run_agent(
                prompt,
                on_update,
                provider=provider,
                model=model
            )

            tasks[task_id]["app_name"] = meta.get("app_name")
            tasks[task_id]["project_dir"] = meta.get("project_dir")
            tasks[task_id]["status"] = "done"

            tasks[task_id]["logs"].append(
                f'✅ "{meta.get("app_name", "App")}" generated successfully!'
            )

        except Exception as e:

            tasks[task_id]["status"] = "error"

            tasks[task_id]["logs"].append(str(e))

    await loop.run_in_executor(None, agent_process)

# =========================================================
# PROTECTED TEST ROUTE
# =========================================================

@app.get("/protected")
def protected(user=Depends(verify_token)):

    return {
        "message": "You are logged in",
        "user": user
    }

# =========================================================
# GENERATE APP ROUTE
# =========================================================

@app.post("/generate")
async def generate_app(
    prompt_data: dict,
    background_tasks: BackgroundTasks,
    user=Depends(verify_token)
):

    prompt = prompt_data.get("prompt", "").strip()

    provider = prompt_data.get(
        "provider",
        "groq"
    ).strip().lower()

    model = prompt_data.get(
        "model",
        "openai/gpt-oss-120b"
    ).strip()

    if not prompt:

        return JSONResponse(
            status_code=400,
            content={"error": "Prompt is required"}
        )

    if len(prompt) > MAX_PROMPT_LENGTH:

        return JSONResponse(
            status_code=400,
            content={
                "error": f"Prompt too long. Max {MAX_PROMPT_LENGTH} characters."
            },
        )

    if provider not in ("gemini", "groq", "ollama"):

        return JSONResponse(
            status_code=400,
            content={"error": f"Unknown provider: {provider}"}
        )

    task_id = str(uuid.uuid4())

    tasks[task_id] = {
        "status": "starting",
        "logs": [],
        "app_name": None,
        "project_dir": None,
    }

    background_tasks.add_task(
        run_agent_background,
        task_id,
        prompt,
        provider,
        model
    )

    return JSONResponse(content={"task_id": task_id})

# =========================================================
# STATUS ROUTE
# =========================================================

@app.get("/status/{task_id}")
async def get_status(task_id: str):

    task = tasks.get(task_id)

    if not task:

        return JSONResponse(
            status_code=404,
            content={"error": "Task not found"}
        )

    response_data = {
        "status": task["status"],
        "logs": task["logs"],
        "app_name": task.get("app_name"),
        "project_dir": task.get("project_dir"),
    }

    if task["status"] in ("done", "error"):

        tasks.pop(task_id, None)

    return JSONResponse(content=response_data)

# =========================================================
# DOWNLOAD GENERATED PROJECT
# =========================================================

@app.get("/download/{folder_name}")
async def download_project(folder_name: str):

    project_path = GENERATED_BASE / folder_name

    if not project_path.exists() or not project_path.is_dir():

        return JSONResponse(
            status_code=404,
            content={"error": f"Project '{folder_name}' not found."},
        )

    buffer = io.BytesIO()

    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:

        for file_path in project_path.rglob("*"):

            if file_path.is_file():

                arcname = file_path.relative_to(project_path)

                zf.write(file_path, arcname)

    buffer.seek(0)

    zip_filename = f"{folder_name}.zip"

    headers = {
        "Content-Disposition": f'attachment; filename="{zip_filename}"'
    }

    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers=headers,
    )

# =========================================================
# ================== AI CHAT API START ====================
# =========================================================

class ChatRequest(BaseModel):
    message: str

@app.post("/chat")
async def chat(
    req: ChatRequest,
    user=Depends(verify_token)
):

    try:

        model = genai.GenerativeModel("gemini-2.5-flash")
        response = model.generate_content(req.message)

        return {
            "reply": response.text
        }

    except Exception as e:

        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

# =========================================================
# =================== AI CHAT API END =====================
# =========================================================

# =========================================================
# STATIC FILES
# =========================================================

app.mount(
    "/generated_project",
    StaticFiles(directory=str(GENERATED_BASE)),
    name="generated_project",
)

app.mount(
    "/",
    StaticFiles(directory="frontend", html=True),
    name="frontend"
)

# =========================================================
# RUN SERVER
# =========================================================

if __name__ == "__main__":

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000
    )