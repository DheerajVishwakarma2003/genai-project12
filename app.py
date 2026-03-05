import os
import base64
import requests
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, auth

# ----------------------
# Load Environment
# ----------------------
load_dotenv()
HF_API_KEY = os.getenv("HF_API_KEY")

app = Flask(__name__)
CORS(app)

# ----------------------
# Firebase Init
# ----------------------
if not firebase_admin._apps:
    cred = credentials.Certificate("firebase_key.json")
    firebase_admin.initialize_app(cred)

# ----------------------
# Hugging Face Models
# ----------------------
IMAGE_MODEL = "https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-xl-base-1.0"

# Chat completions endpoint
CHAT_API_URL = "https://router.huggingface.co/v1/chat/completions"

# Llama 3.1 via Cerebras — free, fast, no cold start
# Format MUST be "model-id:provider"
CHAT_MODEL          = "meta-llama/Llama-3.1-8B-Instruct:cerebras"
CHAT_MODEL_FALLBACK = "meta-llama/Llama-3.1-8B-Instruct:sambanova"

hf_headers = {
    "Authorization": f"Bearer {HF_API_KEY}",
    "Content-Type": "application/json"
}

# ----------------------
# Input Sanitizer
# ----------------------
def sanitize(value, max_len=200):
    if not isinstance(value, str):
        return ""
    return value.strip()[:max_len]


# ----------------------
# Caption Generator
# ----------------------
def generate_caption(topic, tone, platform, description, use_fallback=False):
    model  = CHAT_MODEL_FALLBACK if use_fallback else CHAT_MODEL
    label  = "fallback" if use_fallback else "primary"

    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a creative social media expert. "
                    "Write only the caption text — no explanation, no preamble, "
                    "no quotes around it. Include hashtags and a call to action."
                )
            },
            {
                "role": "user",
                "content": (
                    f"Write a {tone} {platform} caption about '{topic}'. "
                    f"Context: {description}"
                )
            }
        ],
        "max_tokens": 200,
        "temperature": 0.8
    }

    try:
        response = requests.post(
            CHAT_API_URL,
            headers=hf_headers,
            json=payload,
            timeout=60
        )

        print(f"Caption Status ({label}):", response.status_code)
        print(f"Caption Response ({label}):", response.text[:400])

        if response.status_code == 200:
            result  = response.json()
            caption = result["choices"][0]["message"]["content"].strip()

            if caption and len(caption) > 5:
                print(f"✅ Caption ({label}):", caption)
                return caption, None
            else:
                return None, "empty"

        elif response.status_code == 401:
            return None, "invalid_token"
        elif response.status_code == 402:
            return None, "credits_exhausted"
        elif response.status_code == 404:
            return None, "model_not_found"
        elif response.status_code == 503:
            return None, "loading"
        elif response.status_code == 429:
            return None, "rate_limit"
        else:
            return None, f"http_{response.status_code}"

    except requests.exceptions.Timeout:
        return None, "timeout"
    except requests.exceptions.ConnectionError as e:
        return None, "connection_error"
    except Exception as e:
        print(f"❌ Exception ({label}):", e)
        return None, str(e)


@app.route("/")
def home():
    return render_template("index.html")


# ----------------------
# Debug endpoint — visit http://localhost:5000/test-caption
# ----------------------
@app.route("/test-caption")
def test_caption():
    caption, error = generate_caption(
        topic="coffee",
        tone="fun",
        platform="Instagram",
        description="morning coffee vibes"
    )
    return jsonify({
        "hf_key_set":     bool(HF_API_KEY),
        "hf_key_preview": (HF_API_KEY[:8] + "...") if HF_API_KEY else "NOT SET",
        "model":          CHAT_MODEL,
        "caption":        caption,
        "error":          error
    })


@app.route("/generate", methods=["POST"])
def generate():

    # ----------------------
    # Firebase Verify
    # ----------------------
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return jsonify({"error": "No Authorization token"}), 401

    try:
        token = auth_header.split(" ")[1]
        auth.verify_id_token(token)
    except Exception as e:
        print("Firebase Auth Error:", e)
        return jsonify({"error": "Unauthorized"}), 401

    # ----------------------
    # Get + Validate Data
    # ----------------------
    data = request.json
    if not data:
        return jsonify({"error": "No JSON body provided"}), 400

    topic       = sanitize(data.get("topic", ""), 150)
    tone        = sanitize(data.get("tone", "conversational"), 50)
    platform    = sanitize(data.get("platform", "instagram"), 50)
    description = sanitize(data.get("description", ""), 300)

    if not topic:
        return jsonify({"error": "Topic is required"}), 400

    # ----------------------
    # Build Image Prompt
    # ----------------------
    image_prompt = (
        f"Professional advertisement photo for {platform}. "
        f"Topic: {topic}. Mood: {tone}. "
        f"Scene: {description}. "
        "Ultra realistic, cinematic lighting, high resolution, 8K."
    )

    # ----------------------
    # Generate Caption (with fallback)
    # ----------------------
    caption, error = generate_caption(topic, tone, platform, description)

    if not caption:
        print(f"⚠️ Primary failed ({error}), trying fallback...")
        caption, error = generate_caption(topic, tone, platform, description, use_fallback=True)

    if not caption:
        error_messages = {
            "invalid_token":    "Invalid HuggingFace API key. Check your .env file.",
            "credits_exhausted":"HuggingFace monthly credits exhausted. Upgrade to PRO.",
            "model_not_found":  "Caption model not found.",
            "loading":          "Model is loading. Please retry in 20 seconds.",
            "rate_limit":       "Rate limit hit. Please wait and try again.",
            "timeout":          "Caption request timed out. Please try again.",
            "empty":            "Model returned empty response. Please try again.",
            "connection_error": "Could not connect to HuggingFace API.",
        }
        caption = error_messages.get(error, f"Caption generation failed ({error}).")

    print("✅ Final caption:", caption)

    # ----------------------
    # Generate Image
    # ----------------------
    try:
        img_response = requests.post(
            IMAGE_MODEL,
            headers=hf_headers,
            json={"inputs": image_prompt},
            timeout=120
        )

        print("Image Status:", img_response.status_code)

        if img_response.status_code != 200:
            print("Image Error:", img_response.text[:300])
            return jsonify({"error": "Image generation failed", "caption": caption}), 500

        image_bytes = img_response.content
        if not image_bytes:
            return jsonify({"error": "Empty image response", "caption": caption}), 500

        image_base64 = base64.b64encode(image_bytes).decode("utf-8")

    except Exception as e:
        print("Image Exception:", e)
        return jsonify({"error": "Image request failed", "caption": caption}), 500

    # ----------------------
    # Return Result
    # ----------------------
    return jsonify({
        "caption": caption,
        "image":   f"data:image/png;base64,{image_base64}"
    })


if __name__ == "__main__":
    app.run(debug=True)