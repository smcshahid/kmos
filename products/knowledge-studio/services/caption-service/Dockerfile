# Knowledge Studio caption/ASR service image.
# node:22 + python3 + ffmpeg + yt-dlp (standalone binary). Zero npm dependencies.
#   docker build -t caption-service products/knowledge-studio/services/caption-service
#   docker run -p 8092:8092 -e SPEACHES_URL=http://speaches:8000 caption-service
FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 ffmpeg ca-certificates curl \
 && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
 && chmod a+rx /usr/local/bin/yt-dlp \
 && apt-get purge -y curl && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server.mjs ./server.mjs
EXPOSE 8092
CMD ["node", "server.mjs"]
