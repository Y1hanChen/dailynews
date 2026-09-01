FROM python:3.12-slim

WORKDIR /app
COPY . .

ENV PYTHONUNBUFFERED=1
EXPOSE 8787

CMD ["sh", "-c", "python3 server.py --host 0.0.0.0 --port ${PORT:-8787}"]
