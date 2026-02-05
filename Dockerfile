FROM node:20-slim
RUN npm config set registry https://registry.npmmirror.com
RUN sed -i 's/deb.debian.org/mirrors.ustc.edu.cn/g' /etc/apt/sources.list.d/debian.sources
# 安装 Puppeteer 依赖、中文字体和 Emoji 字体
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-wqy-microhei \
    fonts-wqy-zenhei \
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 设置 Puppeteer 使用系统 Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# 创建工作目录
WORKDIR /app

# 复制 package.json
COPY package*.json ./

# 安装依赖
RUN npm install --production

# 复制源代码
COPY . .

# 暴露端口
EXPOSE 51234

# 启动服务
CMD ["npm", "start"]
