FROM python:3.14-slim
RUN pip install --no-cache-dir websockets==15.0.1 paho-mqtt==2.1.0
WORKDIR /app
COPY bridge.py .
VOLUME ["/data"]
CMD ["python", "-u", "bridge.py"]
