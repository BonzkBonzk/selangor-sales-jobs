'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
  const DAY = 86400000;
  const todayMY = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const ageDays = d => d ? Math.floor((Date.parse(todayMY()) - Date.parse(d)) / DAY) : null;

  /* ---------- 条件（勾选） ---------- */
  const KNOWN = {
    jlptn1:'通过 JLPT N1', jlptn2:'JLPT N2 或以上', jlptn3:'JLPT N3 或以上',
    diploma:'商业相关 Diploma', bachelor:'学士学位', sales:'销售经验', sales1:'至少一年销售经验',
    retail:'零售／门店销售经验', retail2:'至少两年销售经验', b2b:'B2B 或顾问式销售经验', appliances:'家电销售经验',
    sales_target:'能按销售目标工作', solar:'Solar／能源相关经验', crm:'会用 CRM',
    english:'英语沟通', malay:'马来语沟通', mandarin:'普通话沟通', cantonese:'广东话沟通',
    drive:'有效汽车驾照', vehicle:'有自己的交通工具', travel:'愿意外出拜访客户／出差', weekends:'接受周末／公假或轮班', spm:'SPM 或以上',
    native_jp:'日语母语级', biz_jp:'日语商务流利', korean:'会韩语', vietnamese:'会越南语', thai:'会泰语'
  };
  const DEFAULT_FACTS = {
    KH: { english:'yes', malay:'yes', mandarin:'yes', cantonese:'yes', diploma:'yes', sales:'yes', sales1:'yes', retail:'yes', retail2:'yes', appliances:'yes', sales_target:'yes' },
    JW: { jlptn1:'yes', jlptn2:'yes', jlptn3:'yes', english:'yes', mandarin:'yes', biz_jp:'yes' }
  };

  /* ---------- 存储 ---------- */
  const KEY = 'ssd.v2';
  let store;
  try { store = JSON.parse(localStorage.getItem(KEY)) || null; } catch { store = null; }
  if (!store) {
    store = { profile:'KH', profiles:{} };
    try { // 迁移旧版浏览器资料
      const old = JSON.parse(localStorage.getItem('sales.profiles.v1')) || {};
      for (const p of ['KH','JW']) if (old[p]) store.profiles[p] = { facts:{ ...old[p].facts }, answers:{ ...old[p].answers } };
      const op = JSON.parse(localStorage.getItem('sales.profile'));
      if (op === 'JW') store.profile = 'JW';
    } catch {}
  }
  const P = () => {
    const p = store.profiles[store.profile] ||= {};
    p.facts ||= {}; p.answers ||= {}; p.fav ||= {}; p.prac ||= {}; p.ni ||= {}; p.tomb ||= {}; p.f ||= {};
    if (!p.f.perV2) { p.f.per = 50; p.f.perV2 = true; }
    if (!('area' in p.f) || (p.f.area === 'selangor' && !p.f.areaV2)) { p.f.area = 'klv'; p.f.areaV2 = true; }
    for (const [k,v] of Object.entries(DEFAULT_FACTS[store.profile])) if (!(k in p.facts)) p.facts[k] = v;
    return p;
  };
  const saveLocal = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { toast('浏览器无法保存，修改只在这次打开期间有效。'); } };
  const save = () => { saveLocal(); queueSync(); };
  // 记录修改时间，方便两台设备合并
  const put = (p, kind, url, obj) => { obj.upd = Date.now(); p[kind][url] = obj; };
  const drop = (p, kind, url) => { if (p[kind][url]) { delete p[kind][url]; p.tomb[kind + '|' + url] = Date.now(); } };
  const touch = (p, kind, url) => { if (p[kind][url]) p[kind][url].upd = Date.now(); };
  const touchFacts = p => { p.factsAt = Date.now(); };
  const isJW = () => store.profile === 'JW';
  const readOnly = () => { try { const c = JSON.parse(localStorage.getItem('ssd.sync')); return !!(c && c.owner && c.owner !== store.profile); } catch { return false; } };

  /* ---------- 数据 ---------- */
  let data = { jobs:[] }, latestBatch = '', byUrl = new Map(), tab = 'list', selected = '', page = 0, jumpTo = false, stick = false;

  const CATS = {
    KH: { '':'所有方向', energy:'能源 / Solar', b2b:'企业销售 / B2B', design:'家装 / 设计（高单价）', retail:'门店（备胎）', property:'房地产', auto:'汽车', digital:'数码 / 科技', finance:'金融 / 保险', education:'教育 / 招生', other:'其他销售' },
    JW: { '':'所有类型', jp_service:'日语客服 / 支援', jp_sales:'日语销售 / 业务', jp_translation:'翻译 / 口译', jp_office:'行政 / 财务 / HR', jp_tech:'IT / 技术', jp_other:'其他' }
  };
  const classify = j => {
    const t = j.title + ' ' + (j.summary || '');
    if (j.role === 'japanese') {
      if (/translat|interpret|翻译|口译/i.test(j.title)) return 'jp_translation';
      if (/customer|客服|service desk|support|helpdesk|client service|customer experience|客户服务/i.test(t)) return 'jp_service';
      if (/sales|business develop|account manager|销售|业务/i.test(t)) return 'jp_sales';
      if (/software|engineer|developer|IT |技术|工程/i.test(t)) return 'jp_tech';
      if (/assistant|admin|finance|account|purchas|procure|HR|people|payroll|order|行政|财务|采购|会计|助理/i.test(t)) return 'jp_office';
      return 'jp_other';
    }
    if (j.sector === 'energy' || /solar|太阳能|储能|renewable/i.test(t)) return 'energy';
    if (/property|real estate|房地产|楼盘|物业/i.test(t)) return 'property';
    if (/car |automotive|汽车|\bEV\b|XPENG|BYD|proton|perodua|motor|tyre|轮胎/i.test(t)) return 'auto';
    if (/financ|insurance|wealth|mortgage|理财|保险|金融|房贷/i.test(t)) return 'finance';
    if (/educat|student|招生|升学|课程|school/i.test(t)) return 'education';
    if (/digital|software|saas|erp|AI |IT |科技|软件|数码/i.test(t)) return 'digital';
    // 先排除被误判成门店的：业务开发、渠道、分销、B2B
    if (/business develop|channel|distribut|分销|经销|B2B|FMCG/i.test(j.title)) return 'b2b';
    // 家装、厨房、室内设计：要量房、谈方案、跟进，比较接近谈大单
    if (/kitchen|interior|renovat|sales designer|design consultant|厨房|室内设计|装修|家装/i.test(t)) return 'design';
    if (/retail|showroom|store|outlet|门店|展厅|零售|promoter|mall/i.test(t)) return 'retail';
    if (/b2b|industrial|engineer|工业|企业|distribut|经销|dealer|logistic|物流|chemical|化工|equipment|设备/i.test(t)) return 'b2b';
    return 'other';
  };

  /* ---------- 薪资 ---------- */
  const payRange = s => {
    if (!s) return null;
    const n = [...String(s).replace(/,/g,'').matchAll(/(\d{3,6})(?:\.\d+)?/g)].map(m => +m[1]).filter(x => x >= 500);
    if (!n.length) return null;
    let lo = Math.min(...n), hi = Math.max(...n);
    if (/年|year|annum/i.test(s)) { lo /= 12; hi /= 12; }
    if (/最高|up to/i.test(s) && n.length === 1) lo = 0;
    return [lo, hi];
  };
  const hasPay = j => !!payRange(j.salary);

  /* ---------- 条件匹配 ---------- */
  // 把不同写法的同一个条件归成同一个 key，改一次就同步到所有职位
  const CANON = [
    [/JLPT\s*N?1|N1 程度|N1 level/i, 'jlptn1', 'JLPT N1'],
    [/JLPT\s*N?2|N2 或以上|BJT/i, 'jlptn2', 'JLPT N2 或以上'],
    [/JLPT\s*N?3/i, 'jlptn3', 'JLPT N3 或以上'],
    [/(日语母语|native japanese|native speaker)/i, 'native_jp', '日语母语级'],
    [/(商务流利|business[- ]level|商务沟通)/i, 'biz_jp', '日语商务流利'],
    [/^(?!.*日语或韩语).*韩语/, 'korean', '会韩语'],
    [/越南语/, 'vietnamese', '会越南语'],
    [/泰语/, 'thai', '会泰语'],
    [/(驾照|licen[cs]e)/i, 'drive', '有效汽车驾照'],
    [/(交通工具|own (car|transport|vehicle)|自己的车)/i, 'vehicle', '有自己的交通工具'],
    [/(广东话|cantonese)/i, 'cantonese', '广东话沟通'],
    [/(普通话|华语|中文|mandarin|chinese)/i, 'mandarin', '普通话／华语沟通'],
    [/(马来语|malay|bahasa)/i, 'malay', '马来语沟通'],
    [/(英语|english)/i, 'english', '英语沟通'],
    [/(学士|bachelor|degree)/i, 'bachelor', '学士学位'],
    [/diploma/i, 'diploma', 'Diploma'],
    [/(周末|公假|weekend|6 天|六天|轮班|shift)/i, 'weekends', '接受周末／公假或轮班'],
    [/(出差|外出拜访|travel|勘察现场)/i, 'travel', '愿意外出拜访客户／出差'],
    [/^SPM/i, 'spm', 'SPM 或以上']
  ];
  const canon = r => {
    if (r.key && !['english','malay','mandarin'].includes(r.key)) return r.key;
    for (const [re, k] of CANON) if (re.test(r.label)) return k;
    return r.key || '';
  };
  const reqKey = r => { const c = canon(r); return c ? 'fact:' + c : 'label:' + r.label.normalize('NFKC').toLowerCase().replace(/[\s，。、,.!?！？:：;；（）()]+/g,' ').trim(); };
  const fit = r => { const k = reqKey(r), p = P(); return (k.startsWith('fact:') ? p.facts[k.slice(5)] : p.answers[k]) || 'unknown'; };
  const setFit = (r, v) => { const p = P(), k = reqKey(r); if (k.startsWith('fact:')) p.facts[k.slice(5)] = v; else p.answers[k] = v; touchFacts(p); save(); };
  const required = j => (j.requirements || []).filter(r => !r.preferred);
  const unmetRatio = j => { const rq = required(j); return rq.length ? rq.filter(r => fit(r) === 'no').length / rq.length : 0; };
  const tooFar = j => unmetRatio(j) > 0.2;

  /* ---------- 通勤（按地区粗分，实际以 Google Maps 为准；新地区加进 NEAR / FAR） ---------- */
  const NEAR = /seri kembangan|serdang|puchong|bukit jalil|sri petaling|kuchai|old klang|jalan klang lama|taman desa|mid ?valley|bangsar south|sungai besi|salak|cheras|balakong|kajang|bangi|cyberjaya|putrajaya|subang jaya|usj|sunway|trx|tun razak|klcc|kuala lumpur city centre|bukit bintang|conlay|ampang park|chan sow lin|taman oug|maluri|pudu|eco city|kl sentral|kuala lumpur sentral|远程|在家工作|remote/i;
  const FAR = /kota damansara|damansara perdana|ara damansara|sri damansara|mont ?kiara|kepong|rawang|klang|kapar|setia alam|shah alam|kota kemuning|sepang|klia|gombak|setapak|selayang|batu caves|johor|penang|pulau pinang|perak|ipoh|melaka|negeri sembilan|seremban|sungai buloh|damansara damai|puncak alam|tun dr ismail|ttdi|segambut|glenmarie|wangsa maju/i;
  const commute = j => { const l = j.location || ''; if (NEAR.test(l)) return 'near'; if (FAR.test(l)) return 'far'; return 'check'; };

  /* ---------- 公司链接：自动生成，不另外查资料 ---------- */
  const AGENCY = /猎头|private advertiser|agensi pekerjaan|nexpipo|persol|michael page|randstad|hays|hunters international|mindpec/i;
  const companyLinks = j => {
    const name = String(j.company || '').replace(/（[^）]*）|\([^)]*\)/g, '').trim();
    if (!name || AGENCY.test(j.company || '')) return '<span class="agency">🕵️ 猎头／未具名公司</span>';
    const g = q => 'https://www.google.com/search?q=' + encodeURIComponent(q);
    return `<a class="btn" href="${esc(g('"' + name + '" Malaysia'))}" target="_blank" rel="noopener noreferrer">🔎 查公司</a>`
      + `<a class="btn" href="${esc(g(name + ' jobstreet company reviews'))}" target="_blank" rel="noopener noreferrer">💬 公司评价</a>`;
  };

  /* ---------- 推荐分（软性，只用来排序和提示） ---------- */
  const reasons = j => {
    const t = [j.title, j.summary, j.commission, j.salary, j.basic].join(' ');
    const out = []; let s = 0;
    const pay = payRange(j.salary);
    if (isJW()) {
      if (classify(j) === 'jp_service') { s += 3; out.push(['客服类', 'good']); }
      if (pay && pay[0] >= 8000) { s += 3; out.push(['底线 ≥ RM8k', 'good']); }
      else if (pay && pay[1] >= 8000) { s += 2; out.push(['最高 RM8k+', 'good']); }
      else if (!pay) { out.push(['没写薪资', '']); }
      else out.push(['低于 RM8k', 'warn']);
      if (/native|母语/i.test(t + (j.requirements || []).map(r => r.label).join(' '))) { s -= 1; out.push(['要求母语级', 'warn']); }
    } else {
      const reqs = j.requirements || [];
      const reqTxt = reqs.map(r => r.label).join(' ');
      const cat = classify(j), cm = commute(j);
      // 通勤：底线单程 1 小时以内
      if (cm === 'near') { s += 1; out.push(['通勤近', 'good']); }
      else if (cm === 'far') { s -= 1.5; out.push(['通勤远', 'warn']); }
      else out.push(['通勤要查', '']);
      // 商场门店：你要离开的那种，留着当备胎
      if (cat === 'retail') { s -= 2; out.push(['门店', 'warn']); }
      // 有人带：你不放宽的条件
      if (/train|培训|mentor|coach|guidance|带新人|手把手/i.test(t)) { s += 1.5; out.push(['有培训', 'good']); }
      else out.push(['问：有人带吗', '']);
      // 行业：房地产、太阳能先，汽车其次
      if (cat === 'property' || cat === 'energy') { s += 1; out.push(['首选行业', 'good']); }
      else if (cat === 'auto') s += 0.5;
      if (!pay) out.push(['没写底薪', '']);
      if (j.commissionType === 'only') { s += 1; out.push(['纯佣金', 'gold']); }
      if (/uncapped|unlimited|无上限|不封顶|no limit|高佣金|high commission/i.test(t)) { s += 2; out.push(['高佣／不封顶', 'good']); }
      const grp = /group commission|team commission|shared commission|团体佣金|团队佣金/i.test(t);
      const indiv = /individual commission|personal commission|own commission|individual sales commission|个人佣金|个人提成/i.test(t);
      if (grp) { s -= 1.5; out.push(['团体佣金', 'warn']); }
      if (indiv && !grp) out.push(['个人佣金', 'good']);
      if (/project|项目|大客户|solar|太阳能|property|房地产|kitchen|interior|室内设计|厨房/i.test(t)) { s += 1; out.push(['开发客户', 'good']); }
      if (/referr|renew|recurring|续约|转介绍|售后|after-sales|长期关系|portfolio/i.test(t)) { s += 1; out.push(['客户能累积', 'good']); }
      // B2B 经验：你没有，有写的往后排
      if (reqs.some(r => r.key === 'b2b' && !/顾问式/.test(r.label))) { s -= 1; out.push(['要B2B经验', 'warn']); }
      // 语言：华语是强项；英语流利／马来语母语可能吃力
      if (reqs.some(r => canon(r) === 'mandarin')) { s += 0.5; out.push(['要华语', 'good']); }
      if (reqs.some(r => ['english', 'malay'].includes(canon(r)) && /流利|fluent|母语|native|简报|presentation|excellent|优秀/i.test(r.label))) out.push(['英/马语要求高', 'warn']);
      if (/6 天|six \(6\)|6 days|周末须上班|每周工作 6/i.test(t + reqTxt)) { s -= 0.5; out.push(['每周 6 天', 'warn']); }
      if (!grp && !indiv) out.push(['问：个人／团体佣金', '']);
    }
    const rq = required(j);
    if (rq.length) { const ok = rq.filter(r => fit(r) === 'yes').length; s += 2 * ok / rq.length; }
    s -= 3 * unmetRatio(j);
    const a = ageDays(j.postedAt); if (a !== null && a <= 3) { s += 0.5; }
    // 旧帖往后排：超过 14 天 −1，超过 21 天 −2
    if (a !== null && a > 21) { s -= 2; out.push(['发布超过 21 天', '']); }
    else if (a !== null && a > 14) { s -= 1; out.push(['发布超过 14 天', '']); }
    return { score: s, tags: out };
  };

  /* ---------- 列表卡片标签：坏信号 → 关键好信号 → 其他，最多 3 个，不重复 ---------- */
  const BAD = new Set(['团体佣金', '通勤远', '要B2B经验', '每周 6 天', '门店']);
  const KEYGOOD = new Set(['个人佣金', '通勤近', '有培训']);
  const NOCARD = /^(高佣／不封顶|没写底薪|没写薪资|发布超过)/; // 太常见或卡片上已显示，只留在详情「推断」
  const cardTags = r => {
    const seen = new Set(), list = [];
    for (const [t, c] of r.tags) { if (NOCARD.test(t) || seen.has(t)) continue; seen.add(t); list.push([t, c]); }
    const rank = ([t, c]) => BAD.has(t) ? 0 : c === 'warn' ? 1 : KEYGOOD.has(t) || (isJW() && c === 'good') ? 2 : c ? 3 : 4;
    return list.map((x, i) => [x, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).slice(0, 3)
      .map(([[t, c]]) => chip(t, c === 'good' ? 'good' : c === 'warn' ? 'bad' : c || 'neutral')).join('');
  };

  /* ---------- 职位过滤 ---------- */
  const forProfile = j => isJW() ? j.role === 'japanese' : j.role !== 'japanese';
  // 没写发布日期的职位：当作第一次抓到那天发布，30 天后自动移出列表
  const dateOf = j => (j && (j.postedAt || j.firstSeen)) || '';
  const fresh = j => dateOf(j) ? ageDays(dateOf(j)) <= 30 : true;
  const passFilters = j => {
    const f = P().f;
    const inKLV = j.region === 'selangor' || j.region === 'kl';
    if (!inKLV) return false; // 只看雪兰莪 + 吉隆坡（地区、方向、来源筛选已拿掉）
    if (f.latest && !(latestBatch && j.batch === latestBatch)) return false;
    if (!isJW() && f.only && j.commissionType !== 'only') return false;
    if (f.pay === 'yes' && !hasPay(j)) return false;
    if (f.pay === 'no' && hasPay(j)) return false;
    if (f.min || f.max) {
      const r = payRange(j.salary);
      if (!r) return false;
      if (r[1] < (f.min || 0) || r[0] > (f.max || Infinity)) return false;
    }
    if (f.q) {
      const hay = [j.title, j.company, j.location, j.summary, j.commission, j.source].join(' ').toLowerCase();
      if (!f.q.toLowerCase().split(/\s+/).every(w => hay.includes(w))) return false;
    }
    return true;
  };

  // 无兴趣只存精简资料（列表用 jobs.json 的完整资料），省同步空间：Google Sheet 一格上限 50,000 字
  const lite = j => ({ url:j.url, title:j.title, company:j.company, location:j.location, region:j.region, role:j.role, source:j.source, postedAt:j.postedAt, firstSeen:j.firstSeen, salary:j.salary });
  const snapshot = j => ({ url:j.url, title:j.title, company:j.company, location:j.location, region:j.region, role:j.role, source:j.source,
    postedAt:j.postedAt, salary:j.salary, basic:j.basic, commission:j.commission, commissionType:j.commissionType, summary:j.summary, sector:j.sector, requirements:j.requirements });

  function purge() {
    const p = P(); let n = 0;
    for (const [u, v] of Object.entries(p.ni)) {
      const j = byUrl.get(u) || v.job;
      // 按职位的发布日期算，不是按标记无兴趣的日期
      const a = j && j.postedAt ? ageDays(j.postedAt) : ageDays(j?.firstSeen || j?.checkedAt || (v.at || '').slice(0,10));
      if (a !== null && a > 30) { drop(p, 'ni', u); n++; }
    }
    if (n) save();
  }

  function groups() {
    const p = P(), all = data.jobs.filter(forProfile);
    const list = [], hidden = [];
    for (const j of all) {
      // 已收藏、练习、无兴趣的职位只放在各自的分组，不再出现在「职位」
      if (!fresh(j) || p.ni[j.url] || p.fav[j.url] || p.prac[j.url]) continue;
      if (j.region !== 'selangor' && j.region !== 'kl') continue; // 和列表一样只算雪兰莪＋吉隆坡，分组数字才对得上
      (tooFar(j) ? hidden : list).push(j);
    }
    const fav = Object.values(p.fav).map(v => byUrl.get(v.job.url) || v.job).filter(forProfile);
    const prac = Object.values(p.prac).map(v => byUrl.get(v.job.url) || v.job).filter(forProfile);
    const ni = Object.values(p.ni).map(v => byUrl.get(v.job.url) || v.job).filter(forProfile);
    return { list, hidden, fav, prac, ni };
  }

  /* ---------- 渲染 ---------- */
  const chip = (t, v = '') => `<span class="chip ${v}">${esc(t)}</span>`;
  const val = t => t ? `<b>${esc(t)}</b>` : '<b class="unk">未写明</b>';
  const allowance = j => { const m = [j.commission, j.salary, j.summary].join(' ').match(/[^，。；,;+＋]*(津贴|allowance|油卡|petrol|车贴|交通费|电话费)[^，。；,;+＋]*/i); return m ? m[0].trim() : ''; };
  const fmtShort = d => d ? String(d).slice(5, 10).replace('-', '/') : '—';
  const when = j => {
    const ago = a => a === null ? '?' : a === 0 ? 'today' : a + 'd ago';
    if (!j.postedAt) return '~' + ago(ageDays(j.firstSeen));
    return ago(ageDays(j.postedAt));
  };

  function render() {
    const p = P(), f = p.f;
    document.querySelectorAll('[data-profile]').forEach(b => b.classList.toggle('on', b.dataset.profile === store.profile));
    document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    $('title').textContent = isJW() ? '日语职位' : '销售职位';
    $('only-comm-wrap').hidden = isJW();
    $('f-sort').value = f.sort || 'score';
    $('f-min').value = f.min || ''; $('f-max').value = f.max || '';
    $('f-pay').value = f.pay || '';
    $('f-only').checked = !!f.only;
    $('f-latest').checked = !!f.latest;
    { const n = [f.min, f.max, f.latest, !isJW() && f.only].filter(Boolean).length; $('adv-n').textContent = n ? ' · ' + n : ''; $('adv-btn').classList.toggle('active', n > 0); }
    $('q').value = f.q || '';

    const g = groups();
    for (const k of ['list','fav','prac','ni','hidden']) $('n-' + k).textContent = g[k].length;
    let rows = (g[tab] || []).filter(j => tab === 'fav' || tab === 'prac' || tab === 'ni' ? true : passFilters(j));
    const sc = new Map(rows.map(j => [j.url, reasons(j)]));
    const sort = f.sort || 'score';
    rows.sort((a, b) => sort === 'new' ? dateOf(b).localeCompare(dateOf(a))
      : sort === 'pay' ? ((payRange(b.salary) || [0,0])[1] - (payRange(a.salary) || [0,0])[1])
      : (sc.get(b.url).score - sc.get(a.url).score) || dateOf(b).localeCompare(dateOf(a)));
    if (tab === 'fav' || tab === 'prac') rows.sort((a,b) => (p[tab][b.url]?.at || '').localeCompare(p[tab][a.url]?.at || ''));
    const splitPay = tab !== 'fav' && tab !== 'prac' && !f.pay;
    if (splitPay) rows = rows.filter(hasPay).concat(rows.filter(j => !hasPay(j)));
    const firstNoPay = splitPay ? rows.findIndex(j => !hasPay(j)) : -1;
    const noPayCount = firstNoPay >= 0 ? rows.length - firstNoPay : 0;
    const noPayLabel = isJW() ? '没写薪资' : '没写底薪';

    const latest = latestBatch;
    const isNewJob = j => !!latest && j.batch === latest;
    const per = f.per ?? 50, pages = per ? Math.max(1, Math.ceil(rows.length / per)) : 1;
    if (jumpTo && per) { const ix = rows.findIndex(j => j.url === selected); if (ix >= 0) page = Math.floor(ix / per); }
    jumpTo = false; if (page >= pages) page = pages - 1; if (page < 0) page = 0;
    const view = per ? rows.slice(page * per, page * per + per) : rows;
    const perSel = `<select class="f-per" aria-label="每页显示">${[[50,'50 个'],[100,'100 个'],[0,'全部']].map(([v,t]) => `<option value="${v}"${v === per ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
    const pagerTop = rows.length ? `<div class="pager top">${rows.length} 个${pages > 1 ? ` · ${page + 1}/${pages}` : ''}${perSel}</div>` : '';
    const pagerBot = pages > 1 ? `<div class="pager"><button data-pg="-1"${page ? '' : ' disabled'}>‹ 上一页</button><span>${page + 1} / ${pages}</span><button data-pg="1"${page < pages - 1 ? '' : ' disabled'}>下一页 ›</button></div>` : '';
    const viewStart = per ? page * per : 0;
    $('list').innerHTML = pagerTop + (rows.length ? view.map((j, vi) => {
      const r = sc.get(j.url), a = ageDays(dateOf(j));
      const divider = viewStart + vi === firstNoPay ? `<div class="paysplit">${esc(noPayLabel)} · ${noPayCount}</div>` : '';
      const isNew = isNewJob(j);
      const expired = (tab === 'fav' || tab === 'prac') && (a !== null && a > 30 || !byUrl.has(j.url));
      const st = (tab === 'fav' || tab === 'prac') ? p[tab][j.url]?.stage : '';
      return `${divider}<button class="item${j.url === selected ? ' sel' : ''}" data-url="${esc(j.url)}">
        <span class="row1">${isNew ? '<em class="new">NEW</em>' : ''}${p.fav[j.url] ? '<em class="heart">❤</em>' : ''}${p.prac[j.url] ? '<em class="prac">🎯</em>' : ''}<strong>${esc(j.title)}</strong></span>
        <span class="co">${esc(j.company)} · ${esc(j.location || '')}</span>
        <span class="row3"><b${j.salary ? '' : ' class="nopay"'}>${esc(j.salary || (j.commission ? '没写底薪' : '没写薪资'))}</b><i>${esc(when(j))}</i></span>
        <span class="tags">${tab === 'hidden' ? required(j).filter(x => fit(x) === 'no').map(x => chip('× ' + x.label.slice(0, 18), 'warn')).join('') : ''}${tab !== 'list' && j.commissionType === 'only' ? chip('纯佣金','gold') : ''}${st ? chip(st + ((tab === 'fav' || tab === 'prac') && p[tab][j.url]?.appliedAt && st !== '想申请' ? ' · ' + fmtD(p[tab][j.url].appliedAt) + ' 申请' : ''),'green') : ''}${expired ? chip('已超过 30 天','warn') : ''}${tab === 'list' ? cardTags(r) : ''}</span>
      </button>`;
    }).join('') : `<p class="empty">${tab === 'fav' ? '还没有收藏' : tab === 'prac' ? '还没有练习' : tab === 'ni' ? '没有' : tab === 'hidden' ? '没有<br><button class="primary" id="go-set">我的条件</button>' : '没有符合的职位'}</p>`) + pagerBot;
    $('list').querySelectorAll('.f-per').forEach(el => el.onchange = () => { P().f.per = +el.value; page = 0; save(); render(); });
    $('list').querySelectorAll('[data-pg]').forEach(b => b.onclick = () => {
      page += +b.dataset.pg; selected = ''; render();
      if (mobile()) $('list').scrollIntoView({ block:'start' }); else $('list').scrollTop = 0;
    });

    if ($('go-set')) $('go-set').onclick = settings;
    // 在详情里收藏、练习或改条件后，职位可能移到别的分组；详情先停在这个职位，避免下一下点到别的职位
    let dj = view.find(j => j.url === selected);
    if (!dj && stick && selected) dj = byUrl.get(selected) || p.fav[selected]?.job || p.prac[selected]?.job;
    if (!dj) { stick = false; selected = view[0]?.url || ''; dj = view.find(j => j.url === selected); }
    renderDetail(dj);
    $('detail').insertAdjacentHTML('afterbegin', '<button class="d-back" id="d-back">← 返回列表</button>');
    $('d-back').onclick = closeDetail;
    renderCal();

    const upd = data.updatedAt ? new Date(data.updatedAt).toLocaleString('zh-MY', { timeZone:'Asia/Kuala_Lumpur', month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
    $('meta').innerHTML = `<span id="sync-badge" title="${esc(syncStatus)}">${syncCfg ? (syncStatus.startsWith('已同步') ? '✓ 已同步' : '⚠︎ 未同步') : ''}</span>`;
    const newCount = g.list.filter(isNewJob).length;
    const latestTxt = latest ? new Date(latest).toLocaleDateString('zh-MY', { timeZone:'Asia/Kuala_Lumpur', month:'numeric', day:'numeric' }) : '';
    $('news').hidden = !newCount;
    $('news').innerHTML = newCount ? `<b>${newCount}</b> 个新职位（${esc(latestTxt)}） <button class="linkbtn" data-latest="${f.latest ? '0' : '1'}">${f.latest ? '显示全部' : '只看新的 →'}</button>` : '';
  }

  function renderDetail(j) {
    const box = $('detail');
    if (!j) { box.innerHTML = '<p class="empty">选择左边的职位查看详情。</p>'; return; }
    const p = P(), r = reasons(j), a = ageDays(dateOf(j));
    const fav = p.fav[j.url], prac = p.prac[j.url], ni = p.ni[j.url];
    const gone = !byUrl.has(j.url) || (a !== null && a > 30);
    const reqs = (j.requirements || []);
    const rq = required(j);
    const pct = rq.length ? Math.round(100 * rq.filter(x => fit(x) === 'no').length / rq.length) : 0;
    const STAGES = ['想申请','已申请','准备面试','面试完','等结果','已拿 offer','没通过','不考虑'];
    const stageSel = (kind, rec) => `<select class="stage" data-kind="${kind}" aria-label="${kind === 'fav' ? '收藏' : '练习'}的跟进状态">${STAGES.map(s => `<option${rec.stage === s ? ' selected' : ''}>${s}</option>`).join('')}</select>`;
    const btnFav = `<button data-kind="fav" class="keep ${fav ? 'on' : ''}">${fav ? '❤ 已收藏' : '♡ 收藏'}</button>`;
    const btnPrac = `<button data-kind="prac" class="keep ${prac ? 'on prac' : ''}">${prac ? '🎯 已练习' : '🎯 练习'}</button>`;
    const btnNi = `<button class="b-ni ${ni ? 'on' : ''}">${ni ? '↩ 恢复' : '🚫 无兴趣'}</button>`;
    const btnDel = (fav || prac) && gone ? '<button class="b-del danger" title="删除">✕ 删除</button>' : '';
    const mStage = (fav ? `<label>收藏 ${stageSel('fav', fav)}</label>` : '') + (prac ? `<label>练习 ${stageSel('prac', prac)}</label>` : '');
    box.innerHTML = `
      <div class="d-head">
        <h2>${esc(j.title)}</h2>
        <p class="co"><b>${esc(j.company)}</b> · ${esc(j.location || '')} · ${esc(when(j))} · ${esc(j.source)}</p>
        ${j.commissionType === 'only' || gone ? `<div class="tags">${j.commissionType === 'only' ? chip('纯佣金','gold') : ''}${gone ? chip('已超过 30 天／已下架','warn') : ''}</div>` : ''}
        ${readOnly() ? `<p class="ro">👀 这是 ${store.profile} 的档案，只能看，不能改。${fav ? ' · ❤ 已收藏' + (fav.stage ? '（' + esc(fav.stage) + '）' : '') : ''}${prac ? ' · 🎯 练习' + (prac.stage ? '（' + esc(prac.stage) + '）' : '') : ''}</p>` : ''}
        <div class="actions${readOnly() ? ' ro-hide' : ''}">
          <a class="primary" href="${esc(j.url)}" target="_blank" rel="noopener noreferrer">打开原帖 ↗</a>
          ${companyLinks(j)}
          <span class="act-gap"></span>
          <span class="keeps">${btnFav}${fav ? stageSel('fav', fav) : ''}${btnPrac}${prac ? stageSel('prac', prac) : ''}${btnNi}${btnDel}</span>
        </div>
      </div>
      ${readOnly() ? '' : `<div class="mbar">${btnFav}${btnPrac}${btnNi}${btnDel}</div>`}
      <section class="facts">
        <h3>薪酬 <span class="src">招聘广告 · 不是保证收入</span></h3>
        <div class="money">
          <div><span>广告薪资</span>${val(j.salary)}</div>
          <div><span>底薪</span>${val(j.basic)}</div>
          ${j.role === 'japanese' && !j.commission ? '' : `<div><span>佣金</span>${val(j.commission || (j.role === 'japanese' ? '' : '有（原帖写明）'))}</div>`}
          <div><span>津贴</span>${val(allowance(j))}</div>
        </div>
        <p class="verified">✓ 已核对原帖 · ${esc(fmtShort(j.checkedAt || j.firstSeen))}${j.datePending ? ' · 发布日期待核对' : ''}</p>
      </section>
      <section><h3>工作内容</h3><p>${esc(j.summary || '—')}</p></section>
      <section class="match">
        <h3>条件匹配 ${rq.length ? `<span class="src">必需 ${rq.length} 项 · <i class="ok">✓ ${rq.filter(x => fit(x) === 'yes').length}</i> · <i class="bad">× ${rq.filter(x => fit(x) === 'no').length}</i> · ～ ${rq.filter(x => fit(x) === 'unknown').length}</span>` : ''}</h3>
        ${reqs.length ? [['必需', false], ['加分项', true]].map(([title, pref]) => { const list = reqs.map((x, i) => [x, i]).filter(([x]) => !!x.preferred === pref); return list.length ? `<h4>${title}</h4><ul class="reqs">${list.map(([x, i]) => { const v = fit(x); return `<li><span class="lbl">${esc(x.label)}</span>
          <span class="tri" data-i="${i}">${[['yes','✓'],['no','×'],['unknown','～']].map(([k,t]) => `<button data-v="${k}" class="${v === k ? 'on ' + k : ''}" aria-label="${k}">${t}</button>`).join('')}</span></li>`; }).join('')}</ul>` : ''; }).join('') : '<p class="unk">原帖没有列出具体条件</p>'}
      </section>
      <section class="facts">
        <h3>推断 <span class="src">AI 判断，只影响排序</span></h3>
        <div class="why">${chip(CATS[store.profile][classify(j)] || '', 'green')}${r.tags.map(t => chip(t[0], t[1])).join('')}</div>
      </section>
      ${fav ? `<section><h3>收藏备注</h3><textarea class="note" data-kind="fav"${readOnly() ? ' readonly' : ''} rows="3" placeholder="面试时间、联系人、想问的问题…">${esc(fav.note || '')}</textarea></section>` : ''}
      ${(fav || prac) ? progressHTML(j, fav, prac, mStage) : ''}
      ${prac ? `<section><h3>练习备注</h3><textarea class="note" data-kind="prac"${readOnly() ? ' readonly' : ''} rows="3" placeholder="想练什么、被问了什么、下次怎么答更好…">${esc(prac.note || '')}</textarea></section>` : ''}`;

    box.querySelectorAll('.log-ics').forEach(b => b.onclick = () => {
      const rec = p[b.dataset.kind][j.url]; const e = (rec?.log || []).find(x => x.id === b.dataset.id); if (e) downloadIcs(j, e);
    });
    if (readOnly()) {
      box.querySelectorAll('.log-add, .log-del').forEach(el => el.remove());
      box.querySelectorAll('.m-stage').forEach(el => el.remove());
      box.querySelectorAll('.actions button, .actions select, .tri button').forEach(el => { if (!el.closest('a')) el.disabled = true; });
      box.querySelector('.actions').classList.remove('ro-hide');
      box.querySelectorAll('.actions button, .actions select').forEach(el => el.style.display = 'none');
      return;
    }
    box.querySelectorAll('button.keep').forEach(b => b.onclick = () => {
      const kind = b.dataset.kind, name = kind === 'fav' ? '收藏' : '练习';
      if (p[kind][j.url]) { if (gone) return confirmDelete(j, kind); drop(p, kind, j.url); toast('已取消' + name); }
      else { put(p, kind, j.url, { job: snapshot(j), at: new Date().toISOString(), stage:'想申请' }); drop(p, 'ni', j.url); toast('已加入「' + name + '」，超过 30 天也会保留'); }
      stick = true; save(); render();
    });
    box.querySelectorAll('.b-ni').forEach(b => b.onclick = () => {
      if (ni) { drop(p, 'ni', j.url); toast('已恢复到列表'); }
      else { put(p, 'ni', j.url, { job: lite(j), at: new Date().toISOString() }); drop(p, 'fav', j.url); drop(p, 'prac', j.url); toast('已移到「无兴趣」，职位发布满 30 天后自动清除'); selected = ''; }
      save(); render();
    });
    box.querySelectorAll('.b-del').forEach(b => b.onclick = () => confirmDelete(j, prac && !fav ? 'prac' : (tab === 'prac' ? 'prac' : 'fav')));
    box.querySelectorAll('select.stage').forEach(el => el.onchange = e => stageModal(j, el.dataset.kind, e.target.value));
    box.querySelectorAll('.log-add').forEach(b => b.onclick = () => stageModal(j, b.dataset.kind, p[b.dataset.kind][j.url]?.stage || '已申请', true));
    box.querySelectorAll('.log-del').forEach(b => b.onclick = () => {
      const rec = p[b.dataset.kind][j.url]; if (!rec) return;
      rec.log = (rec.log || []).filter(x => x.id !== b.dataset.id);
      const ap = rec.log.filter(x => x.s === '已申请').map(x => x.d).sort().pop(); if (ap) rec.appliedAt = ap; else delete rec.appliedAt;
      const last = rec.log.slice().sort((a, c) => (a.d + (a.t || '')).localeCompare(c.d + (c.t || ''))).pop(); rec.stage = last ? last.s : '想申请';
      touch(p, b.dataset.kind, j.url); save(); render();
    });
    box.querySelectorAll('textarea.note').forEach(el => el.onchange = e => { p[el.dataset.kind][j.url].note = e.target.value; touch(p, el.dataset.kind, j.url); save(); });
    box.querySelectorAll('.tri button').forEach(b => b.onclick = () => {
      const i = +b.parentElement.dataset.i; setFit(reqs[i], b.dataset.v); stick = true; render();
    });
  }

  /* ---------- 申请与面试进度 ---------- */
  const fmtD = d => { const [y, m, dd] = d.split('-'); return `${+m}/${+dd}`; };
  const VERB = { '已申请':'申请了', '准备面试':'面试', '面试完':'面试完', '等结果':'等结果', '已拿 offer':'拿到 offer', '没通过':'没通过', '不考虑':'决定不考虑', '想申请':'想申请' };
  function progressHTML(j, fav, prac, mStage = '') {
    const rows = [];
    for (const [kind, rec] of [['fav', fav], ['prac', prac]]) if (rec) for (const e of (rec.log || [])) rows.push({ kind, e });
    rows.sort((a, b) => (a.e.d + (a.e.t || '')).localeCompare(b.e.d + (b.e.t || '')));
    const today = todayMY();
    return `<section class="progress"><h3>进度记录</h3>${mStage ? `<div class="m-stage">${mStage}</div>` : ''}
      ${rows.length ? `<ul class="log">${rows.map(({ kind, e }) => `<li class="${e.s === '准备面试' && e.d >= today ? 'up' : ''}">
        <span><b>${fmtD(e.d)}${e.t ? ' ' + esc(e.t) : ''}</b> ${esc(e.s)}${kind === 'prac' ? ' <em class="tagp">练习</em>' : ''}${e.where ? ' · ' + esc(e.where) : ''}${e.note ? '<br><small>' + esc(e.note) + '</small>' : ''}</span>
        <span class="log-btns">${e.s === '准备面试' ? `<button class="log-ics" data-kind="${kind}" data-id="${e.id}" title="下载日历档">🗓</button>` : ''}<button class="log-del" data-kind="${kind}" data-id="${e.id}" title="删除这笔">✕</button></span></li>`).join('')}</ul>` : '<p class="hint">还没有记录。改上面的状态，或按下面的按钮记一笔。</p>'}
      <div class="actions">${fav ? '<button class="log-add" data-kind="fav">＋ 记一笔（收藏）</button>' : ''}${prac ? '<button class="log-add" data-kind="prac">＋ 记一笔（练习）</button>' : ''}</div>
    </section>`;
  }
  function stageModal(j, kind, stage, chooseStage = false) {
    const p = P(), rec = p[kind][j.url]; if (!rec || readOnly()) return;
    const STG = ['已申请','准备面试','面试完','等结果','已拿 offer','没通过','不考虑','想申请'];
    const title = stage === '已申请' ? '几时申请的？' : stage === '准备面试' ? '面试是几时？' : '记下这一步';
    modal(title, `<p class="hint">「${esc(j.title)}」— ${esc(j.company)}（${kind === 'fav' ? '收藏' : '练习'}）</p>
      <div class="form">
        <label>状态 <select id="s-stage">${STG.map(x => `<option${x === stage ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
        <label>日期 <input id="s-date" type="date" value="${todayMY()}"></label>
        <label id="s-time-w">时间 <input id="s-time" type="time" value="10:00"></label>
        <label id="s-where-w">地点／方式 <input id="s-where" type="text" placeholder="例如：公司地址、Zoom、电话"></label>
        <label>备注 <input id="s-note" type="text" placeholder="可不填"></label>
      </div>
      <div class="actions"><button id="s-cancel">取消</button><button id="s-ok" class="primary">保存</button></div>`);
    const sync = () => { const iv = $('s-stage').value === '准备面试'; $('s-time-w').hidden = !iv; $('s-where-w').hidden = !iv; };
    $('s-stage').onchange = sync; sync();
    if (!chooseStage) $('s-stage').disabled = false;
    $('s-cancel').onclick = () => { $('modal').close(); render(); };
    $('s-ok').onclick = () => {
      const s2 = $('s-stage').value, d = $('s-date').value || todayMY();
      const e = { id: Date.now().toString(36), s: s2, d, at: Date.now() };
      if (s2 === '准备面试') { e.t = $('s-time').value || ''; e.where = $('s-where').value.trim(); }
      const n = $('s-note').value.trim(); if (n) e.note = n;
      (rec.log ||= []).push(e); rec.stage = s2; if (s2 === '已申请') rec.appliedAt = d;
      touch(p, kind, j.url); save(); $('modal').close();
      toast(s2 === '已申请' ? `已记下：${fmtD(d)} 申请了 ${j.company}` : s2 === '准备面试' ? `已记下面试：${fmtD(d)} ${e.t}${syncCfg ? '，订阅日历会自动出现' : ''}` : '已记下');
      render();
    };
  }
  function icsText(j, e) {
    const pad = n => String(n).padStart(2, '0');
    const [y, m, d] = e.d.split('-').map(Number), [hh, mm] = (e.t || '09:00').split(':').map(Number);
    const start = new Date(Date.UTC(y, m - 1, d, hh - 8, mm)), end = new Date(start.getTime() + 3600000);
    const z = t => `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}T${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}00Z`;
    const x = s => String(s || '').replace(/[\\;,]/g, c => '\\' + c).replace(/\n/g, '\\n');
    return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Job//CN','BEGIN:VEVENT', `UID:${e.id}@job`, `DTSTAMP:${z(new Date())}`, `DTSTART:${z(start)}`, `DTEND:${z(end)}`,
      `SUMMARY:${x('面试：' + j.company + ' · ' + j.title)}`, `LOCATION:${x(e.where)}`, `DESCRIPTION:${x((e.note ? e.note + '\n' : '') + j.url)}`,
      'BEGIN:VALARM','TRIGGER:-PT2H','ACTION:DISPLAY','DESCRIPTION:面试提醒','END:VALARM','END:VEVENT','END:VCALENDAR'].join('\r\n');
  }
  function downloadIcs(j, e) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([icsText(j, e)], { type:'text/calendar' }));
    a.download = 'interview-' + e.d + '.ics'; a.click();
  }
  function progressPanel(kind) {
    const p = P(), today = todayMY(), ev = [];
    for (const k of ['fav','prac']) for (const rec of Object.values(p[k])) for (const e of (rec.log || [])) ev.push({ k, e, job: byUrl.get(rec.job.url) || rec.job });
    if (!ev.length) return '';
    const up = ev.filter(x => x.e.s === '准备面试' && x.e.d >= today).sort((a, b) => (a.e.d + (a.e.t||'')).localeCompare(b.e.d + (b.e.t||'')));
    const recent = ev.filter(x => !up.includes(x)).sort((a, b) => (b.e.d + (b.e.t||'')).localeCompare(a.e.d + (a.e.t||''))).slice(0, 8);
    const line = x => `<div class="pl" data-url="${esc(x.job.url)}"><b>${fmtD(x.e.d)}${x.e.t ? ' ' + esc(x.e.t) : ''}</b> ${esc(VERB[x.e.s] || x.e.s)} ${esc(x.job.company)} · ${esc(x.job.title)}${x.k === 'prac' ? ' <em class="tagp">练习</em>' : ''}</div>`;
    let open = true; try { open = localStorage.getItem('ssd.panel') !== '0'; } catch {}
    const sum = `📝 我的进度${up.length ? ` · <span class="up-n">📅 ${up.length} 个面试</span>` : ''}${readOnly() ? '（' + esc(store.profile) + '，只读）' : ''}`;
    return `<details class="panel" id="prog-panel"${open ? ' open' : ''}><summary>${sum}</summary>${up.length ? `<h4>📅 接下来的面试</h4>${up.map(line).join('')}` : ''}<h4>📝 最近进度</h4>${recent.map(line).join('') || '<p class="hint">暂时没有</p>'}</details>`;
  }

  function confirmDelete(j, kind = 'fav') {
    const name = kind === 'fav' ? '收藏' : '练习';
    modal(`确定删除这个${name}吗？`, `<p>「${esc(j.title)}」— ${esc(j.company)}</p><p>这个职位已经发布超过 30 天。删除后不能恢复。</p>
      <div class="actions"><button id="m-no">取消</button><button id="m-yes" class="danger">确认删除</button></div>`);
    $('m-no').onclick = () => $('modal').close();
    $('m-yes').onclick = () => { drop(P(), kind, j.url); save(); $('modal').close(); toast('已删除'); render(); };
  }

  function modal(title, html) { $('modal-title').textContent = title; $('modal-body').innerHTML = html; $('modal').showModal(); }
  let tt; function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 3500); }

  function conditionStats() {
    // 统计这个档案的职位里，每个必需条件出现几次
    const m = new Map();
    for (const j of data.jobs.filter(forProfile).filter(fresh)) for (const r of required(j)) {
      const k = reqKey(r);
      const e = m.get(k) || { k, label: k.startsWith('fact:') ? (KNOWN[k.slice(5)] || r.label) : r.label, n: 0, sample: r };
      e.n++; m.set(k, e);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }
  function settings(mode = 'cond') {
    const p = P();
    const stats = conditionStats();
    const row = e => { const v = fit(e.sample); return `<li><span class="lbl">${esc(e.label)} <small>${e.n} 个职位</small></span><span class="tri" data-k="${esc(e.k)}">${[['yes','✓'],['no','×'],['unknown','～']].map(([x,t]) => `<button data-v="${x}" class="${v === x ? 'on ' + x : ''}">${t}</button>`).join('')}</span></li>`; };
    const top = stats.filter(e => e.n >= 2), rest = stats.filter(e => e.n < 2);
    modal(`${mode === 'set' ? '设置' : '我的条件'}（${store.profile}）`, `
      <div id="m-cond"${mode === 'set' ? ' hidden' : ''}>
      ${readOnly() ? `<p class="ro">👀 这是 ${store.profile} 的条件，只能看。</p>` : ''}<p class="hint">必需条件 × 超过 20% 的职位会移到「不太符合」。</p>
      <ul class="reqs">${top.map(row).join('')}</ul>
      ${rest.length ? `<details><summary>只出现一次的条件（${rest.length}）</summary><ul class="reqs">${rest.map(row).join('')}</ul></details>` : ''}
      </div><div id="m-set"${mode === 'set' ? '' : ' hidden'}>
      <h3 id="set-sync">和对方同步</h3>
      <p class="hint">每人一个同步码：填自己的码，就能在所有设备同步自己的收藏、练习、无兴趣和勾选；切到对方的档案可以看，但不能改。同步码只存在这个浏览器，不要给别人。</p>
      <div class="sync-row"><input id="m-sync" type="password" placeholder="贴上同步码" value="${esc(syncCfg ? syncCfg.raw : '')}"><button id="m-sync-go">${syncCfg ? '更新' : '连接'}</button>${syncCfg ? '<button id="m-sync-off">停止同步</button>' : ''}</div>
      <p class="hint" id="m-sync-status">${esc(syncStatus)}</p>
      <h3>Apple 日历</h3>
      ${syncCfg ? `<p class="hint">订阅一次，之后你记下的面试时间会自动出现在 Apple 日历（Apple 每隔一段时间自动刷新）。只包含你自己（${esc(syncCfg.owner || '')}）的申请和面试。</p>
      <div class="sync-row"><input id="m-cal" readonly value="${esc(syncCfg.url.replace(/^https:/, 'webcal:') + '?ics=1&t=' + syncCfg.t)}"><button id="m-cal-copy">复制</button></div>
      <p class="hint">iPhone：设置 → 日历 → 账户 → 添加账户 → 其他 → 添加已订阅的日历 → 贴上链接。<br>Mac：日历 App → 文件 → 新建日历订阅 → 贴上链接，自动刷新选「每 15 分钟」或「每小时」。</p>` : '<p class="hint">先在上面填同步码，才能订阅日历。也可以在每个面试旁边按 🗓 下载单个日历档。</p>'}
      <h3>备份与换设备</h3>
      <p class="hint">收藏、无兴趣和勾选只存在这个浏览器。换手机或电脑前，先导出，再到新设备导入。</p>
      <div class="actions"><button id="m-exp">导出备份</button><label class="filebtn">导入备份<input id="m-imp" type="file" accept="application/json"></label><button id="m-reset">清除这个档案的勾选</button></div></div>`);
    if ($('m-cal-copy')) $('m-cal-copy').onclick = async () => { try { await navigator.clipboard.writeText($('m-cal').value); toast('已复制日历链接'); } catch { $('m-cal').select(); toast('请手动复制'); } };
    $('m-sync-go').onclick = async () => {
      const raw = $('m-sync').value.trim(); const i = raw.lastIndexOf('#');
      if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec#\w{16,}$/.test(raw)) { toast('同步码格式不对，请整段贴上。'); return; }
      syncCfg = { raw, url: raw.slice(0, i), t: raw.slice(i + 1) };
      try { localStorage.setItem(SYNC_KEY, JSON.stringify(syncCfg)); } catch {}
      $('m-sync-status').textContent = '连接中…';
      await syncNow(true); $('m-sync-status').textContent = syncStatus;
      if (syncCfg && syncCfg.owner && store.profile !== syncCfg.owner) { store.profile = syncCfg.owner; saveLocal(); render(); }
    };
    if ($('m-sync-off')) $('m-sync-off').onclick = () => { syncCfg = null; try { localStorage.removeItem(SYNC_KEY); } catch {} syncStatus = '已停止同步'; $('modal').close(); toast('已停止同步'); };
    $('m-reset').onclick = () => { if (readOnly()) return toast('不能改对方的档案'); p.facts = { ...DEFAULT_FACTS[store.profile] }; p.answers = {}; touchFacts(p); save(); $('modal').close(); toast('已恢复默认勾选'); render(); };
    if (readOnly()) $('modal-body').querySelectorAll('.tri button').forEach(b => b.disabled = true);
    $('modal-body').querySelectorAll('.tri button').forEach(b => b.onclick = () => {
      if (readOnly()) return;
      const k = b.parentElement.dataset.k;
      if (k.startsWith('fact:')) p.facts[k.slice(5)] = b.dataset.v; else p.answers[k] = b.dataset.v;
      touchFacts(p); save();
      b.parentElement.querySelectorAll('button').forEach(x => x.className = x === b ? 'on ' + x.dataset.v : '');
      render();
    });
    $('m-exp').onclick = () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(store, null, 1)], { type:'application/json' }));
      a.download = 'job-backup-' + todayMY() + '.json'; a.click();
    };
    $('m-imp').onchange = async e => {
      try { const s = JSON.parse(await e.target.files[0].text()); if (!s.profiles) throw 0; store = s; save(); $('modal').close(); toast('已导入'); render(); }
      catch { toast('这个文件不是本网站的备份。'); }
    };
  }

  /* ---------- 事件 ---------- */
  const bindF = (id, key, fn = e => e.target.value) => $(id).addEventListener(id === 'q' ? 'input' : 'change', e => { P().f[key] = fn(e); page = 0; save(); render(); });
  bindF('q','q'); bindF('f-sort','sort');
  bindF('f-pay','pay'); bindF('f-min','min', e => +e.target.value || 0); bindF('f-max','max', e => +e.target.value || 0);
  bindF('f-only','only', e => e.target.checked);
  bindF('f-latest','latest', e => e.target.checked);
  $('adv-btn').onclick = () => { const el = $('adv'); el.hidden = !el.hidden; $('adv-btn').setAttribute('aria-expanded', String(!el.hidden)); };
  $('news').addEventListener('click', e => { const b = e.target.closest('[data-latest]'); if (!b) return; P().f.latest = b.dataset.latest === '1'; tab = 'list'; page = 0; save(); render(); });
  document.querySelectorAll('[data-profile]').forEach(b => b.onclick = () => { store.profile = b.dataset.profile; save(); selected = ''; stick = false; page = 0; purge(); render(); });
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; selected = ''; stick = false; page = 0; render(); });
  $('list').addEventListener('click', e => {
    const it = e.target.closest('.item'); if (!it) return;
    selected = it.dataset.url; stick = false; render(); openDetail();
  });
  /* 手机：职位详情全屏打开，返回时列表停在原来的位置 */
  const mobile = () => matchMedia('(max-width: 860px)').matches;
  function openDetail() {
    if (!mobile()) return;
    document.body.classList.add('dopen'); $('detail').scrollTop = 0;
    if (!history.state?.d) history.pushState({ d:1 }, '');
  }
  function closeDetail() { if (history.state?.d) history.back(); else document.body.classList.remove('dopen'); }
  addEventListener('popstate', () => document.body.classList.remove('dopen'));

  /* ---------- 进度日历（可拖动的浮动卡） ---------- */
  let calMonth = todayMY().slice(0, 7), calDay = '';
  const calGet = () => { try { return JSON.parse(localStorage.getItem('ssd.cal')) || {}; } catch { return {}; } };
  const calSet = o => { try { localStorage.setItem('ssd.cal', JSON.stringify({ ...calGet(), ...o })); } catch {} };
  const sideRoom = () => { const m = document.querySelector('main.shell'); return m ? m.getBoundingClientRect().left : 0; };
  function calEvents() {
    const p = P(), ev = [];
    for (const k of ['fav','prac']) for (const rec of Object.values(p[k] || {})) for (const e of (rec.log || [])) ev.push({ k, e, job: byUrl.get(rec.job.url) || rec.job });
    return ev.sort((a, b) => (a.e.d + (a.e.t || '')).localeCompare(b.e.d + (b.e.t || '')));
  }
  function renderCal() {
    let el = $('cal');
    if (!el) { el = document.createElement('div'); el.id = 'cal'; document.body.appendChild(el); bindCal(el); }
    const st = calGet(), today = todayMY(), ev = calEvents();
    const roomy = sideRoom() >= 236;
    const open = st.open ?? roomy;
    const up = ev.filter(x => x.e.s === '准备面试' && x.e.d >= today);
    const ob = $('open-cal'); if (ob) ob.innerHTML = '📅' + (up.length ? `<b>${up.length}</b>` : '');
    if (!open) {
      if (mobile()) { el.innerHTML = ''; return; } // 手机：入口在顶栏 📅，不在右边挡内容
      const y = Math.min(Math.max(st.ty ?? innerHeight * 0.4, 70), innerHeight - 60);
      el.innerHTML = `<button class="cal-tab" style="top:${y}px" title="打开进度日历" aria-label="打开进度日历">‹<span>📅</span>${up.length ? `<b>${up.length}</b>` : ''}</button>`;
      return;
    }
    const w = mobile() ? Math.min(300, innerWidth - 24) : roomy && st.x == null ? Math.min(270, sideRoom() - 28) : 270;
    let x = st.x ?? (roomy ? 14 : innerWidth - w - 14), yy = st.y ?? 78;
    x = Math.min(Math.max(x, 4), innerWidth - w - 4); yy = Math.min(Math.max(yy, 4), innerHeight - 120);
    const [Y, M] = calMonth.split('-').map(Number), first = new Date(Date.UTC(Y, M - 1, 1)).getUTCDay(), days = new Date(Date.UTC(Y, M, 0)).getUTCDate();
    const byDay = {}; for (const x2 of ev) (byDay[x2.e.d] ||= []).push(x2);
    let cells = '<i>日</i><i>一</i><i>二</i><i>三</i><i>四</i><i>五</i><i>六</i>' + '<span></span>'.repeat(first);
    for (let d = 1; d <= days; d++) {
      const ds = `${calMonth}-${String(d).padStart(2, '0')}`, list = byDay[ds] || [];
      const dots = list.length ? `<em class="${list.some(z => z.e.s === '准备面试') ? 'iv' : ''}"></em>` : '';
      cells += `<button data-day="${ds}" class="${ds === today ? 'today ' : ''}${ds === calDay ? 'on ' : ''}${list.length ? 'has' : ''}">${d}${dots}</button>`;
    }
    const line = z => `<button class="cl" data-url="${esc(z.job.url)}" data-k="${z.k}"><b>${fmtD(z.e.d)}${z.e.t ? ' ' + esc(z.e.t) : ''}</b> ${esc(VERB[z.e.s] || z.e.s)} ${esc(z.job.company)}${z.k === 'prac' ? ' <em class="tagp">练习</em>' : ''}</button>`;
    let body;
    if (calDay) body = `<h4>${fmtD(calDay)}</h4>${(byDay[calDay] || []).map(line).join('') || '<p class="hint">这天没有记录</p>'}`;
    else {
      const recent = ev.filter(z => !up.includes(z)).reverse().slice(0, 5);
      body = (up.length ? `<h4>接下来的面试</h4>${up.map(line).join('')}` : '') + `<h4>最近进度</h4>${recent.map(line).join('') || '<p class="hint">还没有记录。收藏或练习职位后，改状态就会记在这里。</p>'}`;
    }
    el.innerHTML = `<section class="cal-card" style="left:${x}px;top:${yy}px;width:${w}px">
      <header class="cal-head" title="按住拖动"><span>📅 进度 · ${esc(store.profile)}${readOnly() ? '（只读）' : ''}</span><button class="cal-close" title="收起" aria-label="收起">›</button></header>
      <div class="cal-m"><button data-m="-1" aria-label="上个月">‹</button><b>${Y} 年 ${M} 月</b><button data-m="1" aria-label="下个月">›</button></div>
      <div class="cal-grid">${cells}</div>
      <div class="cal-list">${body}</div></section>`;
  }
  function bindCal(el) {
    let drag = null;
    el.addEventListener('pointerdown', e => {
      const h = e.target.closest('.cal-head, .cal-tab'); if (!h || e.target.closest('.cal-close')) return;
      const box = h.classList.contains('cal-tab') ? h : el.querySelector('.cal-card'), r = box.getBoundingClientRect();
      drag = { box, tab: h.classList.contains('cal-tab'), dx: e.clientX - r.left, dy: e.clientY - r.top, sx: e.clientX, sy: e.clientY, moved: false };
      h.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', e => {
      if (!drag) return;
      if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 6) drag.moved = true;
      if (!drag.moved) return;
      e.preventDefault();
      if (drag.tab) drag.box.style.top = Math.min(Math.max(e.clientY - drag.dy, 60), innerHeight - 60) + 'px';
      else { drag.box.style.left = Math.min(Math.max(e.clientX - drag.dx, 4), innerWidth - 60) + 'px'; drag.box.style.top = Math.min(Math.max(e.clientY - drag.dy, 4), innerHeight - 60) + 'px'; }
    });
    el.addEventListener('pointerup', () => {
      if (!drag) return; const d = drag; drag = null;
      if (d.moved) { const r = d.box.getBoundingClientRect(); calSet(d.tab ? { ty: r.top } : { x: r.left, y: r.top }); }
      else if (d.tab) { calSet({ open: true }); renderCal(); }
    });
    el.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || b.classList.contains('cal-tab')) return;
      if (b.classList.contains('cal-close')) { calSet({ open: false }); renderCal(); return; }
      if (b.dataset.m) { const [Y, M] = calMonth.split('-').map(Number), d = new Date(Date.UTC(Y, M - 1 + +b.dataset.m, 1)); calMonth = d.toISOString().slice(0, 7); calDay = ''; renderCal(); return; }
      if (b.dataset.day) { calDay = calDay === b.dataset.day ? '' : b.dataset.day; renderCal(); return; }
      if (b.dataset.url) { tab = b.dataset.k; selected = b.dataset.url; jumpTo = true; render(); openDetail(); if (mobile()) { calSet({ open: false }); renderCal(); } }
    });
    addEventListener('resize', () => renderCal());
  }
  $('open-settings').onclick = () => settings();
  $('open-cal').onclick = () => { const o = !(calGet().open ?? false) || !document.querySelector('#cal .cal-card'); calSet({ open: o }); renderCal(); };
  /* 电脑：分组＋筛选整块固定在顶栏下面；列表和详情按它的高度往下排 */
  if ('ResizeObserver' in window) new ResizeObserver(([e]) => document.documentElement.style.setProperty('--barh', Math.ceil(e.target.getBoundingClientRect().height) + 'px')).observe($('bar'));
  $('open-prefs').onclick = () => settings('set');

  /* ---------- 同步（Google Apps Script） ---------- */
  const SYNC_KEY = 'ssd.sync';
  let syncCfg = null, syncStatus = '未连接', syncTimer, syncing = false, syncAgain = false;
  try { syncCfg = JSON.parse(localStorage.getItem(SYNC_KEY)) || null; } catch {}
  const KINDS = ['fav','prac','ni'];
  const pick = p => ({ fav:p.fav||{}, prac:p.prac||{}, ni:Object.fromEntries(Object.entries(p.ni||{}).map(([u, e]) => [u, { ...e, job: lite(e.job || { url:u }) }])), tomb:p.tomb||{}, facts:p.facts||{}, answers:p.answers||{}, factsAt:p.factsAt||0 });
  const stamp = e => e.upd || Date.parse(e.at) || 0;
  function mergeProfile(a = {}, b = {}) {
    const out = { tomb:{ ...(a.tomb||{}) } };
    for (const [k, t] of Object.entries(b.tomb || {})) out.tomb[k] = Math.max(out.tomb[k] || 0, t);
    for (const kind of KINDS) {
      out[kind] = {};
      for (const src of [a[kind] || {}, b[kind] || {}]) for (const [u, e] of Object.entries(src)) {
        if (!out[kind][u] || stamp(e) > stamp(out[kind][u])) out[kind][u] = e;
      }
      for (const [u, e] of Object.entries(out[kind])) if ((out.tomb[kind + '|' + u] || 0) >= stamp(e)) delete out[kind][u];
    }
    const fa = a.factsAt || 0, fb = b.factsAt || 0;
    const w = fb > fa ? b : a;
    out.facts = { ...(w.facts || {}) }; out.answers = { ...(w.answers || {}) }; out.factsAt = Math.max(fa, fb);
    // 墓碑只留 60 天
    const old = Date.now() - 60 * 86400000;
    for (const [k, t] of Object.entries(out.tomb)) if (t < old) delete out.tomb[k];
    return out;
  }
  async function syncNow(loud = false) {
    if (!syncCfg) return;
    if (syncing) { syncAgain = true; return; }
    syncing = true;
    try {
      const r = await fetch(syncCfg.url + '?t=' + encodeURIComponent(syncCfg.t), { cache:'no-store' });
      const res = await r.json();
      if (res.error) throw new Error(res.error === 'auth' ? '同步码不对' : res.error);
      const remote = res.data || {}, owner = res.owner;
      if (syncCfg.owner !== owner) { syncCfg.owner = owner; try { localStorage.setItem(SYNC_KEY, JSON.stringify(syncCfg)); } catch {} }
      // 自己的档案：合并后上传；对方的档案：以对方的为准，只读
      const mine = mergeProfile(pick(store.profiles[owner] || {}), remote[owner] || {});
      Object.assign(store.profiles[owner] ||= {}, mine);
      for (const other of ['KH','JW'].filter(x => x !== owner)) {
        const r = remote[other] || {};
        Object.assign(store.profiles[other] ||= {}, { fav:r.fav||{}, prac:r.prac||{}, ni:r.ni||{}, tomb:r.tomb||{}, facts:{ ...DEFAULT_FACTS[other], ...(r.facts||{}) }, answers:r.answers||{}, factsAt:r.factsAt||0 });
      }
      saveLocal();
      if (JSON.stringify(mine) !== JSON.stringify(remote[owner] ? mergeProfile(remote[owner], {}) : null)) {
        const total = JSON.stringify({ ...remote, [owner]: mine }).length;
        if (total > 45000) toast('同步资料快满了（' + Math.round(total / 1000) + 'k／50k 字），请清掉一些不需要的收藏或无兴趣，或请 Claude 改同步方式');
        await fetch(syncCfg.url, { method:'POST', headers:{ 'Content-Type':'text/plain;charset=utf-8' }, body: JSON.stringify({ t: syncCfg.t, data: mine }) });
      }
      syncStatus = '已同步 · ' + new Date().toLocaleTimeString('zh-MY', { hour:'2-digit', minute:'2-digit' });
      if (loud) toast('已连接并同步');
      if (data.jobs.length) render();
    } catch (e) {
      syncStatus = '同步失败：' + (e.message || '网络问题') + '（修改仍保存在这台设备）';
      if (loud) toast(syncStatus);
    } finally {
      syncing = false;
      const el = $('sync-badge'); if (el) { el.textContent = syncCfg ? (syncStatus.startsWith('已同步') ? '✓ 已同步' : '⚠︎ 未同步') : ''; el.title = syncStatus; }
      if (syncAgain) { syncAgain = false; queueSync(); }
    }
  }
  function queueSync() { if (!syncCfg) return; clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, 1500); }
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });

  fetch('jobs.json', { cache:'no-cache' }).then(r => r.json()).then(d => {
    data = d; byUrl = new Map(d.jobs.map(j => [j.url, j])); latestBatch = d.jobs.reduce((m, j) => (j.batch || '') > m ? j.batch : m, '');
    for (const pr of ['KH','JW']) { const keep = store.profile; store.profile = pr; const p = P(); if (!p.lastVisit || Date.now() - Date.parse(p.lastVisit) > 6 * 3600000) { p.prevVisit = p.lastVisit || ''; p.lastVisit = new Date().toISOString(); } purge(); store.profile = keep; }
    save(); render(); syncNow();
  }).catch(() => { $('list').innerHTML = '<p class="empty">资料读取失败，请稍后刷新。</p>'; });
})();
