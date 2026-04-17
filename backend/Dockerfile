FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
COPY config/ ./config/
RUN chmod +x entrypoint.sh
EXPOSE 5000
CMD ["bash", "entrypoint.sh"]
