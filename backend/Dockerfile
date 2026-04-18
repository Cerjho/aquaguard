FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
COPY config/ ./config/
RUN apt-get update && apt-get install -y dos2unix && dos2unix entrypoint.sh && chmod +x entrypoint.sh && apt-get remove -y dos2unix && apt-get clean
EXPOSE 5000
CMD ["bash", "entrypoint.sh"]
