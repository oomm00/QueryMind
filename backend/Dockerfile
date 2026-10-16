FROM python:3.11-slim

WORKDIR /app

# Install the CPU-only PyTorch wheel first. sentence-transformers depends on
# torch; doing this here keeps pip from pulling the multi-GB CUDA build (plus the
# nvidia-*/triton wheels) that the default PyPI index would otherwise resolve.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# Remaining Python deps. Every package ships a manylinux wheel (psycopg2-binary
# bundles libpq; torch/onnxruntime bundle their own libgomp), so no compiler or
# system PostgreSQL headers are needed.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download ChromaDB's default ONNX embedding model (all-MiniLM-L6-v2).
# The download is lazy (triggered on the first embed call), so without this the
# very first document upload blocks for minutes fetching ~80 MB, and it repeats
# whenever the container is recreated. Calling the embedding function once caches
# the extracted model under /root/.cache/chroma, which the runtime bind mount over
# /app does not shadow.
RUN python -c "from chromadb.utils import embedding_functions as ef; ef.DefaultEmbeddingFunction()(['warmup'])"

# Source code is copied for prod builds; in dev, compose mounts ./backend over /app.
COPY . .

EXPOSE 8000

# Run migrations before starting the API, so a plain `docker run` (without the
# compose command override) also brings the schema up to date.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
