FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
	PYTHONUNBUFFERED=1 \
	PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY backend/requirements-prod.txt ./requirements.txt
RUN python -m pip install --upgrade pip && \
	python -m pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY config/ ./config/

RUN sed -i 's/\r$//' entrypoint.sh && chmod +x entrypoint.sh

EXPOSE 5000
CMD ["bash", "entrypoint.sh"]
