const puppeteer = require('puppeteer');
const ejs = require('ejs');
const fs = require('fs');
const path = require('path');

// ============ 性能优化配置 ============
const CONFIG = {
    // 页面池大小 - 128G 内存可以开很多
    PAGE_POOL_SIZE: 16,
    // 最大并发渲染数 - 5900X 12核24线程
    MAX_CONCURRENT: 16,
    // 页面预热
    PREWARM_PAGES: true,
    // 模板缓存
    CACHE_TEMPLATES: true,
    // 预编译 EJS 模板
    PRECOMPILE_TEMPLATES: true
};

let browser = null;
let pagePool = [];
let busyPages = new Set();
let templateCache = new Map();
let compiledTemplates = new Map();

/**
 * 预编译所有模板
 */
async function precompileTemplates() {
    const templatesDir = path.join(__dirname, '../templates');
    const files = fs.readdirSync(templatesDir).filter(f => f.endsWith('.ejs'));

    for (const file of files) {
        const name = file.replace('.ejs', '');
        const templatePath = path.join(templatesDir, file);
        const template = fs.readFileSync(templatePath, 'utf-8');

        templateCache.set(name, template);
        compiledTemplates.set(name, ejs.compile(template));
        console.log(`Precompiled template: ${name}`);
    }
}

/**
 * 获取或创建浏览器实例
 */
async function getBrowser() {
    if (!browser) {
        // 预编译模板
        if (CONFIG.PRECOMPILE_TEMPLATES) {
            await precompileTemplates();
        }

        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--font-render-hinting=none',
                // 性能优化参数
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-sync',
                '--disable-translate',
                '--metrics-recording-only',
                '--mute-audio',
                '--no-first-run',
                '--safebrowsing-disable-auto-update',
                // 利用多核 CPU
                '--renderer-process-limit=8',
                '--max-active-webgl-contexts=8'
            ],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
        });

        // 预热页面池
        if (CONFIG.PREWARM_PAGES) {
            await prewarmPagePool();
        }
    }
    return browser;
}

/**
 * 预热页面池
 */
async function prewarmPagePool() {
    console.log(`Prewarming ${CONFIG.PAGE_POOL_SIZE} pages...`);
    const promises = [];
    for (let i = 0; i < CONFIG.PAGE_POOL_SIZE; i++) {
        promises.push(createPage());
    }
    const pages = await Promise.all(promises);
    pagePool.push(...pages);
    console.log(`Page pool ready with ${pagePool.length} pages`);
}

/**
 * 创建新页面
 */
async function createPage() {
    const page = await browser.newPage();

    // 禁用不需要的功能以加速
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        const resourceType = req.resourceType();
        // 阻止图片、字体等外部资源（我们用 CDN 的 TailwindCSS 需要放行）
        if (['image', 'media', 'font'].includes(resourceType)) {
            req.abort();
        } else {
            req.continue();
        }
    });

    // 设置默认视口
    await page.setViewport({
        width: 800,
        height: 600,
        deviceScaleFactor: 2
    });

    return page;
}

/**
 * 从池中获取页面
 */
async function acquirePage() {
    // 优先从池中获取空闲页面
    while (pagePool.length > 0) {
        const page = pagePool.pop();
        if (!page.isClosed()) {
            busyPages.add(page);
            return page;
        }
    }

    // 池空了，检查是否可以创建新页面
    if (busyPages.size < CONFIG.MAX_CONCURRENT) {
        const page = await createPage();
        busyPages.add(page);
        return page;
    }

    // 等待有页面释放
    return new Promise((resolve) => {
        const checkInterval = setInterval(async () => {
            if (pagePool.length > 0) {
                clearInterval(checkInterval);
                const page = pagePool.pop();
                if (!page.isClosed()) {
                    busyPages.add(page);
                    resolve(page);
                } else {
                    // 页面已关闭，递归获取
                    resolve(await acquirePage());
                }
            }
        }, 10);
    });
}

/**
 * 释放页面回池
 */
async function releasePage(page) {
    busyPages.delete(page);

    if (page.isClosed()) {
        return;
    }

    // 清理页面状态
    try {
        await page.evaluate(() => {
            document.body.innerHTML = '';
        });
        pagePool.push(page);
    } catch (e) {
        // 页面可能已损坏，创建新页面补充
        try {
            await page.close();
        } catch {}
        if (pagePool.length < CONFIG.PAGE_POOL_SIZE) {
            const newPage = await createPage();
            pagePool.push(newPage);
        }
    }
}

/**
 * 获取模板（带缓存）
 */
function getTemplate(templateName) {
    if (CONFIG.CACHE_TEMPLATES && templateCache.has(templateName)) {
        return templateCache.get(templateName);
    }

    const templatePath = path.join(__dirname, '../templates', `${templateName}.ejs`);
    if (!fs.existsSync(templatePath)) {
        throw new Error(`Template not found: ${templateName}`);
    }

    const template = fs.readFileSync(templatePath, 'utf-8');

    if (CONFIG.CACHE_TEMPLATES) {
        templateCache.set(templateName, template);
        // 同时编译模板
        compiledTemplates.set(templateName, ejs.compile(template));
    }

    return template;
}

/**
 * 渲染模板为 HTML（使用预编译）
 */
function renderTemplate(templateName, data) {
    // 优先使用预编译的模板
    if (compiledTemplates.has(templateName)) {
        return compiledTemplates.get(templateName)(data);
    }

    // 降级到普通渲染
    const template = getTemplate(templateName);
    return ejs.render(template, data);
}

/**
 * 渲染模板为图片
 * @param {string} templateName - 模板名称
 * @param {object} data - 模板数据
 * @param {object} options - 渲染选项
 * @param {number} options.width - 视口宽度（默认800）
 * @returns {Buffer} PNG 图片 buffer
 */
async function render(templateName, data, options = {}) {
    const startTime = Date.now();

    // 使用预编译模板渲染 HTML
    const html = renderTemplate(templateName, data);

    // 获取浏览器和页面
    await getBrowser();
    const page = await acquirePage();

    try {
        // 调整视口（如果需要）
        const width = options.width || 800;
        const currentViewport = page.viewport();
        if (currentViewport.width !== width) {
            await page.setViewport({
                width: width,
                height: 600,
                deviceScaleFactor: 2
            });
        }

        // 加载 HTML - 使用更快的等待策略
        await page.setContent(html, {
            waitUntil: 'domcontentloaded'  // 比 networkidle0 快很多
        });

        // 短暂等待 TailwindCSS 渲染（比等 networkidle0 快）
        await page.waitForFunction(() => {
            return window.tailwind !== undefined || document.readyState === 'complete';
        }, { timeout: 3000 }).catch(() => {});

        // 再等一小会确保样式应用
        await new Promise(r => setTimeout(r, 50));

        // 获取内容实际尺寸
        const boundingBox = await page.evaluate(() => {
            const body = document.body;
            const rect = body.getBoundingClientRect();
            return {
                width: Math.ceil(rect.width),
                height: Math.ceil(rect.height)
            };
        });

        // 截图
        const screenshot = await page.screenshot({
            type: 'png',
            clip: {
                x: 0,
                y: 0,
                width: boundingBox.width,
                height: boundingBox.height
            },
            omitBackground: false
        });

        const elapsed = Date.now() - startTime;
        if (elapsed > 500) {
            console.log(`Render ${templateName}: ${elapsed}ms`);
        }

        return screenshot;
    } finally {
        await releasePage(page);
    }
}

/**
 * 清除模板缓存（开发时使用）
 */
function clearTemplateCache() {
    templateCache.clear();
    console.log('Template cache cleared');
}

// 进程退出时关闭浏览器
process.on('SIGINT', async () => {
    if (browser) {
        await browser.close();
    }
    process.exit();
});

process.on('SIGTERM', async () => {
    if (browser) {
        await browser.close();
    }
    process.exit();
});

module.exports = { render, clearTemplateCache };
