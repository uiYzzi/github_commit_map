import { Router, type IRequest } from 'itty-router';

const router = Router();

interface ContributionData {
  total_contributions: number;
  contributions: ContributionDay[];
  username: string;
  from: string;
  to: string;
  timestamp: string;
}

interface RequestWithParams extends IRequest {
  params: Record<string, string>;
}

interface ContributionDay {
  date: string;
  count: number;
  level: number;
}

interface ParsedContributions {
  total_contributions: number;
  contributions: ContributionDay[];
}

function getContributionLevel(count: number): number {
  if (count === 0) return 0;
  if (count <= 3) return 1;
  if (count <= 6) return 2;
  if (count <= 9) return 3;
  return 4;
}

function parseContributions(html: string): ParsedContributions {
  const contributions: ContributionDay[] = [];
  let total_contributions = 0;

  // 更精确的匹配：找到所有包含data-date的td元素
  const dayRegex = /<td[^>]*class="[^"]*ContributionCalendar-day[^"]*"[^>]*data-date="([^"]*)"[^>]*>/g;
  const toolTipRegex = /<tool-tip[^>]*>([^<]+)<\/tool-tip>/g;
  
  // 提取所有日期和对应的tool-tip
  const dayMatches = Array.from(html.matchAll(dayRegex));
  const toolTipMatches = Array.from(html.matchAll(toolTipRegex));
  
  // 创建日期到tool-tip的映射
  const dateToolTipMap = new Map<string, string>();
  
  // 先收集所有日期
  const dates: string[] = [];
  for (const match of dayMatches) {
    dates.push(match[1]);
  }
  
  // 收集所有tool-tip文本
  const toolTips: string[] = [];
  for (const match of toolTipMatches) {
    toolTips.push(match[1]);
  }
  
  // 配对日期和tool-tip
  for (let i = 0; i < dates.length && i < toolTips.length; i++) {
    const date = dates[i];
    const toolTipText = toolTips[i];
    
    // 解析贡献数量
    let count = 0;
    
    // 匹配 "X contributions" 或 "X contribution"
    const contributionsMatch = toolTipText.match(/(\d+) contributions?/i);
    if (contributionsMatch) {
      count = parseInt(contributionsMatch[1], 10);
    } else if (toolTipText.toLowerCase().includes('no contributions')) {
      count = 0;
    } else {
      // 尝试匹配 "1 contribution" 单数形式
      const singleMatch = toolTipText.match(/(\d+) contribution/i);
      if (singleMatch) {
        count = parseInt(singleMatch[1], 10);
      }
    }
    
    const level = getContributionLevel(count);
    
    contributions.push({
      date,
      count,
      level
    });
    
    total_contributions += count;
  }

  // 如果仍然无法解析，尝试更宽松的匹配
  if (contributions.length === 0) {
    // 提取所有可能的日期和贡献信息
    const allDates = html.match(/data-date="([^"]*)"/g);
    const allToolTips = html.match(/<tool-tip[^>]*>([^<]+)<\/tool-tip>/g);
    
    if (allDates && allToolTips) {
      for (let i = 0; i < allDates.length && i < allToolTips.length; i++) {
        const dateMatch = allDates[i].match(/"([^"]*)"/);
        const toolTipMatch = allToolTips[i].match(/>([^<]+)</);
        
        if (dateMatch && toolTipMatch) {
          const date = dateMatch[1];
          const toolTipText = toolTipMatch[1];
          
          let count = 0;
          const countMatch = toolTipText.match(/(\d+) contributions?/i);
          if (countMatch) {
            count = parseInt(countMatch[1], 10);
          } else if (toolTipText.toLowerCase().includes('no contributions')) {
            count = 0;
          }
          
          const level = getContributionLevel(count);
          
          contributions.push({
            date,
            count,
            level
          });
          
          total_contributions += count;
        }
      }
    }
  }

  // 按日期排序
  contributions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return {
    total_contributions,
    contributions
  };
}

async function fetchContributions(username: string, from: string, to: string): Promise<ParsedContributions> {
  const url = `https://github.com/users/${username}/contributions?from=${from}&to=${to}`;
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Cloudflare-Worker-GitHub-Contributions',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch contributions: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  
  const tableRegex = /<table[\s\S]*?class="ContributionCalendar-grid[\s\S]*?<\/table>/;
  const tableMatch = html.match(tableRegex);

  if (!tableMatch) {
    throw new Error('Could not find contribution calendar in response');
  }

  return parseContributions(tableMatch[0]);
}

function getContributionColor(level: number): string {
  const colors = [
    '#ebedf0', // level 0 - 无贡献
    '#9be9a8', // level 1 - 少量贡献
    '#40c463', // level 2 - 中等贡献
    '#30a14e', // level 3 - 较多贡献
    '#216e39'  // level 4 - 大量贡献
  ];
  return colors[level] || colors[0];
}

function generateContributionSVG(contributionsData: ParsedContributions, username: string, from: string, to: string): string {
  const cellSize = 11;
  const cellGap = 3;
  const weekWidth = cellSize + cellGap;
  const dayHeight = cellSize + cellGap;
  
  // 创建日期映射
  const contributionMap = new Map<string, ContributionDay>();
  contributionsData.contributions.forEach(contrib => {
    contributionMap.set(contrib.date, contrib);
  });
  
  // 计算日期范围
  const startDate = new Date(from);
  const endDate = new Date(to);
  
  // 调整开始日期到周日
  const startOfWeek = new Date(startDate);
  startOfWeek.setDate(startDate.getDate() - startDate.getDay());
  
  // 计算需要的周数
  const weeks: Date[][] = [];
  let currentWeekStart = new Date(startOfWeek);
  
  while (currentWeekStart <= endDate) {
    const week: Date[] = [];
    for (let day = 0; day < 7; day++) {
      const currentDay = new Date(currentWeekStart);
      currentDay.setDate(currentWeekStart.getDate() + day);
      week.push(new Date(currentDay));
    }
    weeks.push(week);
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
  }
  
  // 布局尺寸
  const dayLabelWidth = 35; // 星期标签区域宽度
  const chartLeftMargin = 50; // 热力图左边距
  const chartWidth = weeks.length * weekWidth;
  const chartHeight = 7 * dayHeight;
  
  // 卡片整体尺寸
  const cardPadding = 30;
  const cardWidth = Math.max(550, chartWidth + dayLabelWidth + chartLeftMargin + cardPadding * 2);
  const cardHeight = chartHeight + 160; // 为标题、统计和图例留出空间
  
  // 生成月份标签
  const monthLabels: { month: string; x: number }[] = [];
  let lastMonth = -1;
  weeks.forEach((week, weekIndex) => {
    const firstDay = week[0];
    const month = firstDay.getMonth();
    if (month !== lastMonth && weekIndex > 0) {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      monthLabels.push({
        month: monthNames[month],
        x: weekIndex * weekWidth
      });
      lastMonth = month;
    }
  });
  
  // 生成星期标签
  const dayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
  
  // 计算统计数据
  const totalContributions = contributionsData.total_contributions;
  const activeDays = contributionsData.contributions.filter(day => day.count > 0).length;
  const maxStreak = calculateMaxStreak(contributionsData.contributions);
  const currentStreak = calculateCurrentStreak(contributionsData.contributions);
  
  let svgContent = `
    <svg width="${cardWidth}" height="${cardHeight}" viewBox="0 0 ${cardWidth} ${cardHeight}" xmlns="http://www.w3.org/2000/svg" role="img">
      <style>
        .header {
          font: 600 18px 'Segoe UI', Ubuntu, Sans-Serif;
          fill: #2f80ed;
          animation: fadeInAnimation 0.8s ease-in-out forwards;
        }
        @supports(-moz-appearance: auto) {
          .header { font-size: 15.5px; }
        }
        
        .stat {
          font: 600 14px 'Segoe UI', Ubuntu, "Helvetica Neue", Sans-Serif;
          fill: #434d58;
        }
        @supports(-moz-appearance: auto) {
          .stat { font-size: 12px; }
        }
        
        .stagger {
          opacity: 0;
          animation: fadeInAnimation 0.3s ease-in-out forwards;
        }
        
        .contrib-month {
          font: 10px 'Segoe UI', Ubuntu, Sans-Serif;
          fill: #656d76;
        }
        
        .contrib-day {
          font: 9px 'Segoe UI', Ubuntu, Sans-Serif;
          fill: #656d76;
          text-anchor: start;
        }
        
        .contrib-legend {
          font: 12px 'Segoe UI', Ubuntu, Sans-Serif;
          fill: #656d76;
        }
        
        .contrib-square {
          shape-rendering: crispEdges;
          opacity: 0;
          animation: fadeInAnimation 0.3s ease-in-out forwards;
        }
        
        .bold { font-weight: 700; }
        
        @keyframes fadeInAnimation {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      </style>

      <!-- 卡片背景 -->
      <rect
        x="0.5"
        y="0.5"
        rx="4.5"
        height="${cardHeight - 1}"
        width="${cardWidth - 1}"
        fill="#fffefe"
        stroke="#e4e2e2"
        stroke-width="1"
      />

      <!-- 标题 -->
      <g data-testid="card-title" transform="translate(${cardPadding}, 35)">
        <text x="0" y="0" class="header">${username}'s GitHub Contributions</text>
      </g>

      <!-- 统计信息 -->
      <g transform="translate(${cardPadding}, 70)">
        <g class="stagger" style="animation-delay: 150ms">
          <text class="stat" x="0" y="0">Total Contributions:</text>
          <text class="stat bold" x="180" y="0" style="fill: #2f80ed;">${totalContributions}</text>
        </g>
        <g class="stagger" style="animation-delay: 300ms" transform="translate(280, 0)">
          <text class="stat" x="0" y="0">Active Days:</text>
          <text class="stat bold" x="120" y="0" style="fill: #2f80ed;">${activeDays}</text>
        </g>
      </g>

      <!-- 热力图区域 -->
      <g transform="translate(${cardPadding}, 90)">
        <!-- 月份标签 -->`;
  
  monthLabels.forEach(label => {
    svgContent += `
        <text x="${label.x + chartLeftMargin}" y="15" class="contrib-month">${label.month}</text>`;
  });
  
  // 星期标签
  dayLabels.forEach((label, index) => {
    if (label) {
      svgContent += `
        <text x="10" y="${35 + index * dayHeight}" class="contrib-day" text-anchor="start">${label}</text>`;
    }
  });
  
  // 生成贡献方块
  weeks.forEach((week, weekIndex) => {
    week.forEach((day, dayIndex) => {
      const dateStr = day.toISOString().split('T')[0];
      const contribution = contributionMap.get(dateStr);
      const level = contribution ? contribution.level : 0;
      const count = contribution ? contribution.count : 0;
      const color = getContributionColor(level);
      
      const x = weekIndex * weekWidth + chartLeftMargin;
      const y = dayIndex * dayHeight + 25;
      
      // 只显示在范围内的日期
      if (day >= startDate && day <= endDate) {
        const delay = (weekIndex * 7 + dayIndex) * 10; // 减少动画延迟，让动画更流畅
        svgContent += `
        <rect class="contrib-square" x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${color}" rx="2" ry="2" style="animation-delay: ${delay}ms">
          <title>${count} contribution${count !== 1 ? 's' : ''} on ${dateStr}</title>
        </rect>`;
      }
    });
  });
  
  // 添加图例到右下角
  svgContent += `
      </g>

      <!-- 图例 -->
      <g transform="translate(${cardWidth - 150}, ${cardHeight - 30})">
        <text x="0" y="0" class="contrib-legend">Less</text>`;
  
  for (let i = 0; i <= 4; i++) {
    const legendX = 30 + i * (cellSize + 3);
    svgContent += `
        <rect x="${legendX}" y="-8" width="${cellSize}" height="${cellSize}" fill="${getContributionColor(i)}" rx="2" ry="2" class="contrib-square"></rect>`;
  }
  
  svgContent += `
        <text x="${30 + 5 * (cellSize + 3) + 8}" y="0" class="contrib-legend">More</text>
      </g>
    </svg>`;
  
  return svgContent;
}

function calculateMaxStreak(contributions: ContributionDay[]): number {
  let maxStreak = 0;
  let currentStreak = 0;
  
  for (const day of contributions) {
    if (day.count > 0) {
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }
  
  return maxStreak;
}

function calculateCurrentStreak(contributions: ContributionDay[]): number {
  let currentStreak = 0;
  
  // 从最近的日期开始倒序计算
  for (let i = contributions.length - 1; i >= 0; i--) {
    if (contributions[i].count > 0) {
      currentStreak++;
    } else {
      break;
    }
  }
  
  return currentStreak;
}

router.get('/api/contributions/:username', async (request: RequestWithParams) => {
  try {
    const { username } = request.params;
    const url = new URL(request.url);
    const searchParams = url.searchParams;

    const currentYear = new Date().getFullYear().toString();
    const from = searchParams.get('from') || `${currentYear}-01-01`;
    const to = searchParams.get('to') || `${currentYear}-12-31`;

    const contributionsData = await fetchContributions(username, from, to);

    const result: ContributionData = {
      total_contributions: contributionsData.total_contributions,
      contributions: contributionsData.contributions,
      username,
      from,
      to,
      timestamp: new Date().toISOString()
    };

    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600'
      }
    });

  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        timestamp: new Date().toISOString()
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
});

router.get('/api/contributions/:username/svg', async (request: RequestWithParams) => {
  try {
    const { username } = request.params;
    const url = new URL(request.url);
    const searchParams = url.searchParams;

    const currentYear = new Date().getFullYear().toString();
    const from = searchParams.get('from') || `${currentYear}-01-01`;
    const to = searchParams.get('to') || `${currentYear}-12-31`;

    const contributionsData = await fetchContributions(username, from, to);
    const svgContent = generateContributionSVG(contributionsData, username, from, to);

    return new Response(svgContent, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600'
      }
    });

  } catch (error) {
    // 生成错误 SVG
    const errorSVG = `
      <svg width="400" height="100" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#f6f8fa"/>
        <text x="20" y="30" font-family="Arial, sans-serif" font-size="14" fill="#d1242f">
          Error loading contributions
        </text>
        <text x="20" y="50" font-family="Arial, sans-serif" font-size="12" fill="#656d76">
          ${error instanceof Error ? error.message : 'Unknown error occurred'}
        </text>
      </svg>`;
    
    return new Response(errorSVG, {
      status: 500,
      headers: {
        'Content-Type': 'image/svg+xml'
      }
    });
  }
});

router.get('/health', () => {
  return new Response(JSON.stringify({
    status: 'healthy',
    timestamp: new Date().toISOString()
  }), {
    headers: {
      'Content-Type': 'application/json'
    }
  });
});

router.get('/', () => {
  return new Response(`
    <html>
      <head>
        <title>GitHub Contributions API</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; }
          .endpoint { background: #f5f5f5; padding: 15px; margin: 10px 0; border-radius: 5px; }
          code { background: #e8e8e8; padding: 2px 4px; border-radius: 3px; }
        </style>
      </head>
      <body>
        <h1>GitHub Contributions Heatmap API</h1>
        <p>This Cloudflare Worker provides an API to fetch GitHub contribution heatmaps.</p>
        
        <div class="endpoint">
          <h3>Get Contributions Heatmap (JSON)</h3>
          <p><strong>Endpoint:</strong> <code>GET /api/contributions/:username</code></p>
          <p><strong>Parameters:</strong></p>
          <ul>
            <li><code>username</code> (path): GitHub username</li>
            <li><code>from</code> (query, optional): Start date (YYYY-MM-DD), defaults to current year Jan 1</li>
            <li><code>to</code> (query, optional): End date (YYYY-MM-DD), defaults to current year Dec 31</li>
          </ul>
          <p><strong>Example:</strong> <code>/api/contributions/octocat?from=2024-01-01&to=2024-12-31</code></p>
        </div>

        <div class="endpoint">
          <h3>Get Contributions Heatmap (SVG)</h3>
          <p><strong>Endpoint:</strong> <code>GET /api/contributions/:username/svg</code></p>
          <p><strong>Parameters:</strong></p>
          <ul>
            <li><code>username</code> (path): GitHub username</li>
            <li><code>from</code> (query, optional): Start date (YYYY-MM-DD), defaults to current year Jan 1</li>
            <li><code>to</code> (query, optional): End date (YYYY-MM-DD), defaults to current year Dec 31</li>
          </ul>
          <p><strong>Example:</strong> <code>/api/contributions/octocat/svg?from=2024-01-01&to=2024-12-31</code></p>
          <p><strong>Returns:</strong> SVG image that mimics GitHub's contribution heatmap</p>
        </div>

        <div class="endpoint">
          <h3>Health Check</h3>
          <p><strong>Endpoint:</strong> <code>GET /health</code></p>
        </div>
      </body>
    </html>
  `, {
    headers: {
      'Content-Type': 'text/html'
    }
  });
});

router.all('*', () => {
  return new Response('Not Found', { status: 404 });
});

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    return router.handle(request, env, ctx);
  }
};