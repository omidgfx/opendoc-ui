FROM python:3.13-alpine
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py ./
ENV PORT=8787 AI_GATEWAY_BIND=0.0.0.0
EXPOSE 8787
USER nobody
CMD ["sh", "-c", "uvicorn app:app --host ${AI_GATEWAY_BIND:-0.0.0.0} --port ${PORT:-8787}"]
