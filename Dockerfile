FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    OLLAMA_HOST=0.0.0.0:11434 \
    OLLAMA_MODELS=/home/user/.ollama/models \
    CITYTASTE_OLLAMA_URL=http://127.0.0.1:11434 \
    CITYTASTE_OLLAMA_MODEL=gemma3:4b \
    CITYTASTE_LLM_TEMPERATURE=0.1 \
    CITYTASTE_LLM_MAX_TOKENS=180 \
    CITYTASTE_OLLAMA_TIMEOUT=180 \
    CITYTASTE_OLLAMA_KEEP_ALIVE=30m \
    CITYTASTE_OLLAMA_NUM_CTX=2048

RUN useradd -m -u 1000 user

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    build-essential \
    cmake \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://ollama.com/install.sh | sh

WORKDIR /home/user/app

COPY requirements.txt /home/user/app/requirements.txt

RUN mkdir -p /home/user/.ollama/models && chown -R user:user /home/user

USER user

RUN python -m pip install --upgrade pip setuptools wheel && \
    pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch==2.11.0 && \
    grep -v '^torch==' requirements.txt > requirements-space.txt && \
    pip install --no-cache-dir -r requirements-space.txt

COPY --chown=user . /home/user/app

RUN bash -lc 'ollama serve > /tmp/ollama.log 2>&1 & \
    for i in $(seq 1 60); do \
      curl -fsS http://127.0.0.1:11434/api/tags >/dev/null && break; \
      sleep 1; \
    done && \
    ollama pull "${CITYTASTE_OLLAMA_MODEL}" && \
    pkill ollama || true'

WORKDIR /home/user/app/Assistant_IA

EXPOSE 7860

CMD ["bash", "-lc", "ollama serve > /tmp/ollama.log 2>&1 & until curl -fsS http://127.0.0.1:11434/api/tags >/dev/null; do sleep 1; done; uvicorn app:app --host 0.0.0.0 --port 7860"]