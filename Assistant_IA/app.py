from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from services.assistant import simple_citytaste_assistant, get_place_details_for_ui

app = FastAPI(title="CityTaste Assistant API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str


@app.get("/")
def root():
    return {"status": "ok", "message": "CityTaste Assistant API is running"}


@app.post("/api/chat")
def chat(req: ChatRequest):
    return simple_citytaste_assistant(req.message)


@app.get("/api/place/{internal_id}")
def place_details(internal_id: int):
    place = get_place_details_for_ui(internal_id)
    if place is None:
        return {"found": False, "message": "Lieu introuvable."}
    return {"found": True, "place": place}