from django.shortcuts import render
import json
import os

import requests
from django.http import JsonResponse
from django.views.decorators.http import require_POST

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

SYSTEM_PROMPT = (
    "You are a friendly class assistant that helps students understand their lessons. "
    "Explain things in simple, clear language with a short example when it helps. "
    "Keep answers short (under 150 words). Use short paragraphs and use **bold** "
    "only for key terms. Do not use tables or headings. "
    "If a question is unrelated to studying or learning, politely steer back to the lesson."
)

MAX_MESSAGE_LENGTH = 1000
MAX_HISTORY_ITEMS = 10


def chat_page(request):
    return render(request, "chat.html")


@require_POST
def chat_api(request):
    # 1. Read and validate the request from our own JavaScript
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid request."}, status=400)

    message = (body.get("message") or "").strip()
    if not message:
        return JsonResponse({"error": "Please type a question first."}, status=400)
    if len(message) > MAX_MESSAGE_LENGTH:
        return JsonResponse(
            {"error": f"Please keep your question under {MAX_MESSAGE_LENGTH} characters."},
            status=400,
        )

    # 2. Build the conversation (previous messages + the new one)
    contents = []
    for item in (body.get("history") or [])[-MAX_HISTORY_ITEMS:]:
        role = "model" if item.get("role") == "model" else "user"
        text = str(item.get("text", ""))[:2000]
        if text:
            contents.append({"role": role, "parts": [{"text": text}]})
    contents.append({"role": "user", "parts": [{"text": message}]})

    # 3. The API key stays here on the server. The browser never sees it.
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return JsonResponse({"error": "The assistant is not set up yet."}, status=500)

    model = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": contents,
    }

    # 4. Call Gemini (same idea as requests.get in the OpenWeather app)
    try:
        response = requests.post(
            GEMINI_URL.format(model=model),
            headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
            json=payload,
            timeout=60,
        )
        response.raise_for_status()
        data = response.json()

    except requests.exceptions.HTTPError as e:
        status = e.response.status_code if e.response is not None else 0
        # Shows in the terminal only (never sent to the browser)
        print("Gemini error:", status, e.response.text[:300] if e.response is not None else "")
        if status == 429:
            error = "Too many requests right now. Please wait a moment and try again."
        elif status == 503:
            error = "The AI is busy right now. Please try again in a few seconds."
        elif status in (400, 401, 403):
            error = "The assistant is not set up correctly. Please check the API key."
        elif status == 404:
            error = "The AI model was not found. Please check the model name."
        else:
            error = "The AI service had a problem. Please try again."
        # Never send str(e) to the user: it can contain the request URL.
        return JsonResponse({"error": error}, status=502)

    # 5. Pull the text out of the JSON response
    try:
        parts = data["candidates"][0]["content"]["parts"]
        reply = "".join(part.get("text", "") for part in parts).strip()
    except (KeyError, IndexError, TypeError):
        reply = ""

    if not reply:
        return JsonResponse(
            {"error": "I couldn't answer that one. Try rephrasing your question."},
            status=502,
        )

    return JsonResponse({"reply": reply})
# Create your views here.
