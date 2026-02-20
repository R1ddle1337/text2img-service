const express = require('express');
const cors = require('cors');
const path = require('path');
const renderService = require('./render');

const app = express();
const PORT = process.env.PORT || 51234;

// 中间件
app.use(cors());
app.use(express.json());

// 请求日志
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// 获取星期几
function getWeekday() {
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    return '星期' + weekdays[new Date().getDay()];
}

// 获取当前日期
function getDateStr() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    return `${year}年${month}月${day}日`;
}

function sanitizeText(input, maxLen = 140) {
    const text = String(input ?? '').replace(/\u0000/g, '').trim();
    if (!text) return '';
    return text.length > maxLen ? `${text.slice(0, maxLen - 3)}...` : text;
}

function normalizeQfarmRows(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.slice(0, 80).map((row) => {
        if (row && typeof row === 'object') {
            const label = sanitizeText(row.label, 40);
            const value = sanitizeText(row.value, 220);
            if (label) return { label, value };
            return { value };
        }
        return { value: sanitizeText(row, 220) };
    }).filter((row) => row.value || row.label);
}

// 健康检查
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * 通用渲染接口
 * POST /render
 * Body: { title, subtitle, items?, content?, table?, stats?, quote?, ... }
 * Returns: PNG image
 */
app.post('/render', async (req, res) => {
    try {
        const data = {
            ...req.body,
            weekday: req.body.weekday || getWeekday(),
            subtitle: req.body.subtitle || getDateStr()
        };

        const imageBuffer = await renderService.render('universal', data);

        res.set('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (error) {
        console.error('Render error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 发病语录
 * POST /api/fabing
 * Body: { saying: "..." }
 */
app.post('/api/fabing', async (req, res) => {
    try {
        const { saying } = req.body;
        const data = {
            title: '发病语录',
            icon: '🤒',
            subtitle: getDateStr(),
            content: saying,
            quote: '适量发病有益身心健康~',
            sources: '60s语录合集'
        };
        const imageBuffer = await renderService.render('universal', data);
        res.set('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (error) {
        console.error('Fabing render error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * KFC 文案
 * POST /api/kfc
 * Body: { text: "..." }
 */
app.post('/api/kfc', async (req, res) => {
    try {
        const { text } = req.body;
        const data = {
            title: '疯狂星期四',
            icon: '🍗',
            subtitle: getDateStr(),
            weekday: getWeekday(),
            content: text,
            quote: 'V我50，今天吃什么？',
            sources: '60s语录合集 · KFC文案'
        };
        const imageBuffer = await renderService.render('universal', data);
        res.set('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (error) {
        console.error('KFC render error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 黄金价格
 * POST /api/gold
 * Body: { date, metals, stores, recycle }
 */
app.post('/api/gold', async (req, res) => {
    try {
        const { date, metals, stores, recycle } = req.body;

        // 构建表格数据
        const table = [];
        if (metals && metals.length > 0) {
            metals.slice(0, 4).forEach(m => {
                table.push({ label: m.name, value: `${m.today_price} ${m.unit}` });
            });
        }
        if (stores && stores.length > 0) {
            stores.slice(0, 4).forEach(s => {
                table.push({ label: s.brand, value: s.formatted });
            });
        }

        const data = {
            title: '实时金价',
            icon: '🏆',
            subtitle: date || getDateStr(),
            weekday: getWeekday(),
            table: table,
            quote: '数据仅供参考，投资需谨慎',
            sources: '60s语录合集 · 黄金价格'
        };
        const imageBuffer = await renderService.render('universal', data);
        res.set('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (error) {
        console.error('Gold render error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 运势
 * POST /api/luck
 * Body: { luck_desc, luck_rank, luck_tip }
 */
app.post('/api/luck', async (req, res) => {
    try {
        const { luck_desc, luck_rank, luck_tip } = req.body;

        const data = {
            title: '今日运势',
            icon: '🔮',
            subtitle: getDateStr(),
            weekday: getWeekday(),
            stats: {
                '运势类型': luck_desc || '未知',
                '运势指数': `${luck_rank || 0}/100`
            },
            quote: luck_tip || '祝你今天好运！',
            sources: '60s语录合集 · 仅供娱乐'
        };
        const imageBuffer = await renderService.render('universal', data);
        res.set('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (error) {
        console.error('Luck render error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 课表渲染（网格布局）
 * POST /api/timetable
 * Body: {
 *   title: "第X周课表",
 *   subtitle: "2024-2025-2",
 *   week: 1,           // 当前周次（可选，用于标题）
 *   courses: [         // 课程列表
 *     {
 *       weekday: 1,           // 1=周一, 7=周日
 *       section_start: 1,     // 起始节次 (1, 3, 5, 7, 9)
 *       course_name: "高数",
 *       location: "A101",
 *       teacher: "张老师",
 *       weeks_raw: "1-16周"   // 可选，显示周次范围
 *     }
 *   ]
 * }
 */
app.post('/api/timetable', async (req, res) => {
    try {
        const { title, subtitle, week, courses } = req.body;

        // 构建网格数据结构: grid[weekday][section_key] = [courses]
        const grid = {};
        for (let wd = 1; wd <= 7; wd++) {
            grid[wd] = {};
        }

        // 将课程填入网格
        if (courses && Array.isArray(courses)) {
            courses.forEach(course => {
                const wd = course.weekday || 1;
                // 将节次映射到大节 key (1-2->1, 3-4->3, 5-6->5, 7-8->7, 9-10->9)
                let sectionKey = course.section_start || 1;
                // 规范化到奇数节次
                if (sectionKey % 2 === 0) {
                    sectionKey = sectionKey - 1;
                }

                if (!grid[wd][sectionKey]) {
                    grid[wd][sectionKey] = [];
                }

                grid[wd][sectionKey].push({
                    name: course.course_name || '未知课程',
                    location: course.location || '',
                    teacher: course.teacher || '',
                    weeks: course.weeks_raw || ''
                });
            });
        }

        const data = {
            title: title || (week ? `第${week}周课表` : '课程表'),
            subtitle: subtitle || getDateStr(),
            weekday: getWeekday(),
            courseCount: courses ? courses.length : 0,
            grid: grid
        };

        const imageBuffer = await renderService.render('timetable', data, { width: 1100 });
        res.set('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (error) {
        console.error('Timetable render error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 通用内容渲染（用于 AI 资讯等）
 * POST /api/universal
 * Body: { title, content, icon?, subtitle?, ... }
 */
app.post('/api/universal', async (req, res) => {
    try {
        const { title, content, icon } = req.body;

        const data = {
            title: title || '资讯',
            icon: icon || '📋',
            subtitle: getDateStr(),
            weekday: getWeekday(),
            content: content,
            sources: '60s语录合集'
        };
        const imageBuffer = await renderService.render('universal', data);
        res.set('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (error) {
        console.error('Universal render error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * qfarm 结构化渲染
 * POST /api/qfarm
 * Body: {
 *   title, subtitle, icon, theme, summary,
 *   stats: [{ label, value }],
 *   sections: [{ title, rows: [{ label?, value }] }],
 *   page: { index, total }, footer
 * }
 */
app.post('/api/qfarm', async (req, res) => {
    try {
        const body = (req.body && typeof req.body === 'object') ? req.body : {};

        const themeInput = sanitizeText(body.theme || 'light', 16).toLowerCase();
        if (!['light', 'dark'].includes(themeInput)) {
            return res.status(400).json({ error: 'theme 仅支持 light|dark' });
        }

        const stats = Array.isArray(body.stats)
            ? body.stats
                .slice(0, 10)
                .map((item) => ({
                    label: sanitizeText(item && item.label, 30),
                    value: sanitizeText(item && item.value, 80),
                }))
                .filter((item) => item.label || item.value)
            : [];

        const sections = Array.isArray(body.sections)
            ? body.sections
                .slice(0, 8)
                .map((section) => ({
                    title: sanitizeText(section && section.title, 24),
                    rows: normalizeQfarmRows(section && section.rows),
                }))
                .filter((section) => Array.isArray(section.rows) && section.rows.length > 0)
            : [];

        const pageRaw = (body.page && typeof body.page === 'object') ? body.page : {};
        const pageIndex = Math.max(1, parseInt(pageRaw.index, 10) || 1);
        const pageTotal = Math.max(pageIndex, parseInt(pageRaw.total, 10) || pageIndex);

        const data = {
            title: sanitizeText(body.title, 30) || 'QFarm 结果',
            subtitle: sanitizeText(body.subtitle, 60) || getDateStr(),
            icon: sanitizeText(body.icon, 8) || '🌾',
            theme: themeInput,
            summary: sanitizeText(body.summary, 220),
            stats,
            sections,
            page: { index: pageIndex, total: pageTotal },
            footer: sanitizeText(body.footer, 80) || 'astrbot_plugin_qfarm',
        };

        const imageBuffer = await renderService.render('qfarm', data, { width: 920 });
        res.set('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (error) {
        console.error('QFarm render error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 井字棋游戏渲染
 * POST /api/tictactoe
 * Body: {
 *   board: ['X', 'O', '', '', 'X', ...],  // 9个元素，'X', 'O' 或 ''
 *   player_x_name: "玩家A",
 *   player_o_name: "玩家B",              // 可为空表示等待加入
 *   current_turn: "X",                    // 'X' 或 'O'
 *   winner: "X",                          // 'X', 'O' 或 null
 *   is_finished: false,
 *   subtitle: "第 3 回合"                 // 可选
 * }
 */
app.post('/api/tictactoe', async (req, res) => {
    try {
        const {
            board,
            player_x_name,
            player_o_name,
            current_turn,
            winner,
            is_finished,
            subtitle
        } = req.body;

        const data = {
            board: board || Array(9).fill(''),
            player_x_name: player_x_name || '玩家X',
            player_o_name: player_o_name || '',
            current_turn: current_turn || 'X',
            winner: winner || null,
            is_finished: is_finished || false,
            subtitle: subtitle || ''
        };

        const imageBuffer = await renderService.render('tictactoe', data, { width: 420 });
        res.set('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (error) {
        console.error('TicTacToe render error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 围棋游戏渲染
 * POST /api/go
 * Body: {
 *   board: ['B', 'W', '', ...],  // board_size * board_size 个元素
 *   board_size: 9,                // 9, 13, 或 19
 *   black_player_name: "玩家A",
 *   player_white_name: "玩家B",
 *   current_turn: "B",            // 'B' 或 'W'
 *   captured_black: 0,
 *   captured_white: 0,
 *   move_count: 0,
 *   last_move: null,              // 最后落子位置索引
 *   is_finished: false,
 *   winner: null,                 // 'B', 'W' 或 null
 *   subtitle: "第 15 手"
 * }
 */
app.post('/api/go', async (req, res) => {
    try {
        const {
            board,
            board_size,
            black_player_name,
            player_white_name,
            current_turn,
            captured_black,
            captured_white,
            move_count,
            last_move,
            is_finished,
            winner,
            subtitle
        } = req.body;

        const size = board_size || 9;

        const data = {
            board: board || Array(size * size).fill(''),
            board_size: size,
            black_player_name: black_player_name || '黑方',
            player_white_name: player_white_name || '',
            current_turn: current_turn || 'B',
            captured_black: captured_black || 0,
            captured_white: captured_white || 0,
            move_count: move_count || 0,
            last_move: last_move !== undefined ? last_move : null,
            is_finished: is_finished || false,
            winner: winner || null,
            subtitle: subtitle || ''
        };

        // 根据棋盘大小调整渲染宽度
        const widthMap = { 9: 450, 13: 550, 19: 700 };
        const width = widthMap[size] || 450;

        const imageBuffer = await renderService.render('go', data, { width });
        res.set('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (error) {
        console.error('Go render error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 五子棋游戏渲染
 * POST /api/gomoku
 * Body: {
 *   board: ['B', 'W', '', ...],  // board_size * board_size 个元素
 *   board_size: 15,               // 13, 15, 或 19
 *   black_player_name: "玩家A",
 *   white_player_name: "玩家B",
 *   current_turn: "B",            // 'B' 或 'W'
 *   move_count: 0,
 *   last_move: null,              // 最后落子位置索引
 *   win_line: null,               // 获胜连线位置数组 [pos1, pos2, ...]
 *   is_finished: false,
 *   winner: null,                 // 'B', 'W' 或 null
 *   subtitle: "第 15 手"
 * }
 */
app.post('/api/gomoku', async (req, res) => {
    try {
        const {
            board,
            board_size,
            black_player_name,
            white_player_name,
            current_turn,
            move_count,
            last_move,
            win_line,
            is_finished,
            winner,
            subtitle
        } = req.body;

        const size = board_size || 15;

        const data = {
            board: board || Array(size * size).fill(''),
            board_size: size,
            black_player_name: black_player_name || '黑方',
            white_player_name: white_player_name || '',
            current_turn: current_turn || 'B',
            move_count: move_count || 0,
            last_move: last_move !== undefined ? last_move : null,
            win_line: win_line || null,
            is_finished: is_finished || false,
            winner: winner || null,
            subtitle: subtitle || ''
        };

        // 根据棋盘大小调整渲染宽度
        const widthMap = { 13: 500, 15: 550, 19: 700 };
        const width = widthMap[size] || 550;

        const imageBuffer = await renderService.render('gomoku', data, { width });
        res.set('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (error) {
        console.error('Gomoku render error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 四子棋游戏渲染
 * POST /api/connect4
 */
app.post('/api/connect4', async (req, res) => {
    try {
        const {
            board,
            columns,
            rows,
            player_red_name,
            player_yellow_name,
            current_turn,
            move_count,
            last_move,
            is_finished,
            winner,
            subtitle
        } = req.body;

        const cols = columns || 7;
        const rws = rows || 6;

        const data = {
            board: board || Array(cols * rws).fill(''),
            columns: cols,
            rows: rws,
            player_red_name: player_red_name || '红方',
            player_yellow_name: player_yellow_name || '',
            current_turn: current_turn || 'R',
            move_count: move_count || 0,
            last_move: last_move !== undefined ? last_move : null,
            is_finished: is_finished || false,
            winner: winner || null,
            subtitle: subtitle || ''
        };

        const width = Math.max(420, cols * 64 + 80);
        const imageBuffer = await renderService.render('connect4', data, { width });
        res.set('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (error) {
        console.error('Connect4 render error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 扫雷游戏渲染
 * POST /api/minesweeper
 */
app.post('/api/minesweeper', async (req, res) => {
    try {
        const {
            cells,
            width,
            height,
            mine_count,
            player_name,
            move_count,
            flags_used,
            is_finished,
            is_win,
            subtitle
        } = req.body;

        const w = width || 9;
        const h = height || 9;

        const data = {
            cells: cells || Array(w * h).fill('hidden'),
            width: w,
            height: h,
            mine_count: mine_count || 10,
            player_name: player_name || '玩家',
            move_count: move_count || 0,
            flags_used: flags_used || 0,
            is_finished: is_finished || false,
            is_win: is_win || false,
            subtitle: subtitle || ''
        };

        const longSide = Math.max(w, h);
        const cellSize = longSide <= 9 ? 34 : (longSide <= 12 ? 30 : 26);
        const gridWidth = w * cellSize + (w - 1) * 6;
        const rowLabelW = longSide <= 9 ? 18 : 20;
        const sideBlockW = rowLabelW * 2 + 6 * 2;
        const renderWidth = Math.max(460, gridWidth + sideBlockW + 120);

        const imageBuffer = await renderService.render('minesweeper', data, { width: renderWidth });
        res.set('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (error) {
        console.error('Minesweeper render error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 2048 游戏渲染
 * POST /api/game2048
 */
app.post('/api/game2048', async (req, res) => {
    try {
        const {
            board,
            size,
            player_name,
            score,
            best_tile,
            move_count,
            is_finished,
            is_win,
            subtitle,
            last_spawn_pos
        } = req.body;

        const n = size || 4;

        const data = {
            board: board || Array(n * n).fill(0),
            size: n,
            player_name: player_name || '玩家',
            score: score || 0,
            best_tile: best_tile || 0,
            move_count: move_count || 0,
            is_finished: is_finished || false,
            is_win: is_win || false,
            subtitle: subtitle || '',
            last_spawn_pos: last_spawn_pos !== undefined ? last_spawn_pos : null
        };

        const tileSize = n <= 4 ? 84 : (n <= 5 ? 68 : 56);
        const renderWidth = Math.max(460, n * tileSize + (n - 1) * 10 + 120);

        const imageBuffer = await renderService.render('game2048', data, { width: renderWidth });
        res.set('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (error) {
        console.error('2048 render error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 德州扑克渲染
 * POST /api/texas
 */
app.post('/api/texas', async (req, res) => {
    try {
        const {
            phase_text,
            pot,
            current_bet,
            community_cards,
            players,
            is_finished,
            winner_names,
            last_action,
            subtitle
        } = req.body;

        const list = Array.isArray(players) ? players : [];

        const data = {
            phase_text: phase_text || '等待玩家',
            pot: pot || 0,
            current_bet: current_bet || 0,
            community_cards: community_cards || [],
            players: list,
            is_finished: is_finished || false,
            winner_names: winner_names || [],
            last_action: last_action || '',
            subtitle: subtitle || ''
        };

        // 双列玩家卡片，宽度按玩家数量轻微放大
        const width = list.length > 4 ? 920 : 860;
        const imageBuffer = await renderService.render('texas', data, { width });
        res.set('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (error) {
        console.error('Texas render error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 21点渲染
 * POST /api/blackjack
 */
app.post('/api/blackjack', async (req, res) => {
    try {
        const {
            phase_text,
            dealer_cards,
            dealer_value_text,
            players,
            is_finished,
            winner_names,
            last_action,
            subtitle
        } = req.body;

        const list = Array.isArray(players) ? players : [];

        const data = {
            phase_text: phase_text || '等待发牌',
            dealer_cards: dealer_cards || [],
            dealer_value_text: dealer_value_text || '0',
            players: list,
            is_finished: is_finished || false,
            winner_names: winner_names || [],
            last_action: last_action || '',
            subtitle: subtitle || ''
        };

        const width = list.length > 3 ? 920 : 860;
        const imageBuffer = await renderService.render('blackjack', data, { width });
        res.set('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (error) {
        console.error('Blackjack render error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * UNO渲染
 * POST /api/uno
 */
app.post('/api/uno', async (req, res) => {
    try {
        const {
            phase_text,
            top_card,
            current_color,
            direction,
            pending_draw,
            players,
            is_finished,
            winner_name,
            last_action,
            subtitle
        } = req.body;

        const list = Array.isArray(players) ? players : [];

        const data = {
            phase_text: phase_text || '等待发牌',
            top_card: top_card || '',
            current_color: current_color || 'R',
            direction: direction || 1,
            pending_draw: pending_draw || 0,
            players: list,
            is_finished: is_finished || false,
            winner_name: winner_name || '',
            last_action: last_action || '',
            subtitle: subtitle || ''
        };

        const width = list.length > 4 ? 980 : 900;
        const imageBuffer = await renderService.render('uno', data, { width });
        res.set('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (error) {
        console.error('UNO render error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 斗地主渲染
 * POST /api/doudizhu
 */
app.post('/api/doudizhu', async (req, res) => {
    try {
        const {
            phase_text,
            landlord_name,
            bottom_cards,
            players,
            last_play_text,
            current_turn_name,
            winner_text,
            is_finished,
            last_action,
            subtitle
        } = req.body;

        const list = Array.isArray(players) ? players : [];

        const data = {
            phase_text: phase_text || '等待发牌',
            landlord_name: landlord_name || '',
            bottom_cards: bottom_cards || [],
            players: list,
            last_play_text: last_play_text || '无',
            current_turn_name: current_turn_name || '',
            winner_text: winner_text || '',
            is_finished: is_finished || false,
            last_action: last_action || '',
            subtitle: subtitle || ''
        };

        const width = 920;
        const imageBuffer = await renderService.render('doudizhu', data, { width });
        res.set('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (error) {
        console.error('DouDizhu render error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 中国象棋游戏渲染
 * POST /api/xiangqi
 * Body: {
 *   board: ['RC', 'RH', 'RE', ...],  // 90 个元素
 *   red_player_name: "玩家A",
 *   black_player_name: "玩家B",
 *   current_turn: "R",               // 'R' 或 'B'
 *   move_count: 0,
 *   last_move: { from: 4, to: 13 },  // 可为 null
 *   in_check: false,
 *   is_finished: false,
 *   winner: null,                    // 'R', 'B' 或 null
 *   subtitle: "第 10 回合"
 * }
 */
app.post('/api/xiangqi', async (req, res) => {
    try {
        const {
            board,
            red_player_name,
            black_player_name,
            current_turn,
            move_count,
            last_move,
            in_check,
            is_finished,
            winner,
            subtitle
        } = req.body;

        const data = {
            board: board || Array(90).fill(''),
            red_player_name: red_player_name || '红方',
            black_player_name: black_player_name || '',
            current_turn: current_turn || 'R',
            move_count: move_count || 0,
            last_move: last_move || null,
            in_check: in_check || false,
            is_finished: is_finished || false,
            winner: winner || null,
            subtitle: subtitle || ''
        };

        const imageBuffer = await renderService.render('xiangqi', data, { width: 500 });
        res.set('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (error) {
        console.error('Xiangqi render error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 游戏帮助渲染
 * POST /api/gamehelp
 */
app.post('/api/gamehelp', async (req, res) => {
    try {
        const { subtitle } = req.body;

        const data = {
            subtitle: subtitle || 'Game Plugin v1.0'
        };

        const imageBuffer = await renderService.render('gamehelp', data, { width: 480 });
        res.set('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (error) {
        console.error('GameHelp render error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 军棋翻棋游戏渲染
 * POST /api/junqi
 */
app.post('/api/junqi', async (req, res) => {
    try {
        const {
            board,
            player_a_name,
            player_b_name,
            player_a_side,
            player_b_side,
            current_turn,
            move_count,
            last_action,
            last_pos,
            is_finished,
            winner,
            subtitle
        } = req.body;

        const data = {
            board: board || [],
            player_a_name: player_a_name || '玩家A',
            player_b_name: player_b_name || '',
            player_a_side: player_a_side || null,
            player_b_side: player_b_side || null,
            current_turn: current_turn || 1,
            move_count: move_count || 0,
            last_action: last_action || null,
            last_pos: last_pos !== undefined ? last_pos : null,
            is_finished: is_finished || false,
            winner: winner || null,
            subtitle: subtitle || ''
        };

        const imageBuffer = await renderService.render('junqi', data, { width: 400 });
        res.set('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (error) {
        console.error('Junqi render error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 启动服务
app.listen(PORT, () => {
    console.log(`🖼️  Text2Img Service running on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/health`);
});
