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
    p.facts ||= {}; p.answers ||= {}; p.fav ||= {}; p.prac ||= {}; p.ni ||= {}; p.f ||= {};
    if (!('area' in p.f) || (p.f.area === 'selangor' && !p.f.areaV2)) { p.f.area = 'klv'; p.f.areaV2 = true; }
    for (const [k,v] of Object.entries(DEFAULT_FACTS[store.profile])) if (!(k in p.facts)) p.facts[k] = v;
    return p;
  };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { toast('浏览器无法保存，修改只在这次打开期间有效。'); } };
  const isJW = () => store.profile === 'JW';

  /* ---------- 数据 ---------- */
  let data = { jobs:[] }, byUrl = new Map(), tab = 'list', selected = '';

  const CATS = {
    KH: { '':'所有方向', energy:'能源 / Solar', b2b:'企业销售 / B2B', retail:'门店 / 展厅', property:'房地产', auto:'汽车', digital:'数码 / 科技', finance:'金融 / 保险', education:'教育 / 招生', other:'其他销售' },
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
    if (/car |automotive|汽车|EV |motor|tyre|轮胎/i.test(t)) return 'auto';
    if (/financ|insurance|wealth|mortgage|理财|保险|金融|房贷/i.test(t)) return 'finance';
    if (/educat|student|招生|升学|课程|school/i.test(t)) return 'education';
    if (/digital|software|saas|erp|AI |IT |科技|软件|数码/i.test(t)) return 'digital';
    if (/retail|showroom|store|门店|展厅|零售/i.test(t)) return 'retail';
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
  const setFit = (r, v) => { const p = P(), k = reqKey(r); if (k.startsWith('fact:')) p.facts[k.slice(5)] = v; else p.answers[k] = v; save(); };
  const required = j => (j.requirements || []).filter(r => !r.preferred);
  const unmetRatio = j => { const rq = required(j); return rq.length ? rq.filter(r => fit(r) === 'no').length / rq.length : 0; };
  const tooFar = j => unmetRatio(j) > 0.2;

  /* ---------- 推荐分（软性，只用来排序和提示） ---------- */
  const reasons = j => {
    const t = [j.title, j.summary, j.commission, j.salary, j.basic].join(' ');
    const out = []; let s = 0;
    const pay = payRange(j.salary);
    if (isJW()) {
      if (classify(j) === 'jp_service') { s += 3; out.push(['客服类', 'good']); }
      if (pay && pay[0] >= 8000) { s += 3; out.push(['底线 ≥ RM8k', 'good']); }
      else if (pay && pay[1] >= 8000) { s += 2; out.push(['最高可达 RM8k+', 'good']); }
      else if (!pay) { s += 0.5; out.push(['薪资未公开', '']); }
      else out.push(['低于 RM8k', 'warn']);
      if (/native|母语/i.test(t + (j.requirements || []).map(r => r.label).join(' '))) { s -= 1; out.push(['要求母语级', 'warn']); }
    } else {
      if (j.commissionType === 'only') { s += 1; out.push(['纯佣金', 'gold']); }
      if (/uncapped|unlimited|无上限|不封顶|no limit|高佣金|high commission/i.test(t)) { s += 2; out.push(['佣金不封顶 / 高佣金', 'good']); }
      if (/b2b|project|项目|大客户|key account|solar|太阳能|property|房地产|equipment|设备/i.test(t)) { s += 1; out.push(['能学开发客户／谈大单', 'good']); }
      if (/referr|renew|recurring|续约|转介绍|售后|after-sales|长期关系|portfolio/i.test(t)) { s += 1; out.push(['客户能累积', 'good']); }
      if (/train|培训|mentor|coach/i.test(t)) { s += 0.5; out.push(['有培训', '']); }
      if (/6 天|six \(6\)|6 days|周末须上班|每周工作 6/i.test(t + (j.requirements || []).map(r => r.label).join(' '))) { s -= 0.5; out.push(['每周 6 天', 'warn']); }
    }
    const rq = required(j);
    if (rq.length) { const ok = rq.filter(r => fit(r) === 'yes').length; s += 2 * ok / rq.length; }
    s -= 3 * unmetRatio(j);
    const a = ageDays(j.postedAt); if (a !== null && a <= 3) { s += 0.5; }
    return { score: s, tags: out };
  };

  /* ---------- 职位过滤 ---------- */
  const forProfile = j => isJW() ? j.role === 'japanese' : j.role !== 'japanese';
  const fresh = j => j.postedAt ? ageDays(j.postedAt) <= 30 : (j.checkedAt ? ageDays(j.checkedAt) <= 7 : true);
  const passFilters = j => {
    const f = P().f;
    const inKLV = j.region === 'selangor' || j.region === 'kl';
    if (f.area === 'klv' && !inKLV) return false;
    if (f.area === 'selangor' && j.region !== 'selangor') return false;
    if (f.area === 'kl' && j.region !== 'kl') return false;
    if (f.area === 'other' && inKLV) return false;
    if (f.cat && classify(j) !== f.cat) return false;
    if (f.src && j.source !== f.src) return false;
    if (!isJW() && f.only && j.commissionType !== 'only') return false;
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

  const snapshot = j => ({ url:j.url, title:j.title, company:j.company, location:j.location, region:j.region, role:j.role, source:j.source,
    postedAt:j.postedAt, salary:j.salary, basic:j.basic, commission:j.commission, commissionType:j.commissionType, summary:j.summary, sector:j.sector, requirements:j.requirements });

  function purge() {
    const p = P(); let n = 0;
    for (const [u, v] of Object.entries(p.ni)) {
      const j = byUrl.get(u) || v.job;
      // 按职位的发布日期算，不是按标记无兴趣的日期
      const a = j && j.postedAt ? ageDays(j.postedAt) : ageDays(j?.firstSeen || j?.checkedAt || (v.at || '').slice(0,10));
      if (a !== null && a > 30) { delete p.ni[u]; n++; }
    }
    if (n) save();
  }

  function groups() {
    const p = P(), all = data.jobs.filter(forProfile);
    const list = [], hidden = [];
    for (const j of all) {
      if (!fresh(j) || p.ni[j.url]) continue;
      (tooFar(j) ? hidden : list).push(j);
    }
    const fav = Object.values(p.fav).map(v => byUrl.get(v.job.url) || v.job).filter(forProfile);
    const prac = Object.values(p.prac).map(v => byUrl.get(v.job.url) || v.job).filter(forProfile);
    const ni = Object.values(p.ni).map(v => byUrl.get(v.job.url) || v.job).filter(forProfile);
    return { list, hidden, fav, prac, ni };
  }

  /* ---------- 渲染 ---------- */
  const chip = (t, v = '') => `<span class="chip ${v}">${esc(t)}</span>`;
  const when = j => {
    if (!j.postedAt) return j.source === 'Indeed' ? '30 天内发布（Indeed 未显示日期）' : '发布日期待核对';
    const a = ageDays(j.postedAt);
    return a === 0 ? '今天发布' : a === 1 ? '昨天发布' : `${a} 天前发布`;
  };

  function render() {
    const p = P(), f = p.f;
    document.querySelectorAll('[data-profile]').forEach(b => b.classList.toggle('on', b.dataset.profile === store.profile));
    document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    $('title').textContent = isJW() ? '日语职位' : '销售职位';
    $('subtitle').textContent = isJW() ? '雪兰莪 + 吉隆坡 · 全职 · 写明薪资 · 日语客服、月薪 RM8,000 以上排前面' : '雪兰莪 + 吉隆坡 · 全职 · 写明薪资 · 原帖写明有佣金';
    $('only-comm-wrap').hidden = isJW();
    $('f-cat').innerHTML = Object.entries(CATS[store.profile]).map(([k,v]) => `<option value="${k}"${k === (f.cat || '') ? ' selected' : ''}>${v}</option>`).join('');
    $('f-area').value = f.area ?? 'klv';
    $('f-src').value = f.src || '';
    $('f-sort').value = f.sort || 'score';
    $('f-min').value = f.min || ''; $('f-max').value = f.max || '';
    $('f-only').checked = !!f.only;
    $('q').value = f.q || '';

    const g = groups();
    for (const k of ['list','fav','prac','ni','hidden']) $('n-' + k).textContent = g[k].length;
    let rows = (g[tab] || []).filter(j => tab === 'fav' || tab === 'prac' || tab === 'ni' ? true : passFilters(j));
    const sc = new Map(rows.map(j => [j.url, reasons(j)]));
    const sort = f.sort || 'score';
    rows.sort((a, b) => sort === 'new' ? (b.postedAt || '').localeCompare(a.postedAt || '')
      : sort === 'pay' ? ((payRange(b.salary) || [0,0])[1] - (payRange(a.salary) || [0,0])[1])
      : (sc.get(b.url).score - sc.get(a.url).score) || (b.postedAt || '').localeCompare(a.postedAt || ''));
    if (tab === 'fav' || tab === 'prac') rows.sort((a,b) => (p[tab][b.url]?.at || '').localeCompare(p[tab][a.url]?.at || ''));

    const latest = data.jobs.reduce((m, j) => j.firstSeen > m ? j.firstSeen : m, '');
    const seenBefore = p.prevVisit || '';
    $('list').innerHTML = rows.length ? rows.map(j => {
      const r = sc.get(j.url), a = ageDays(j.postedAt);
      const isNew = seenBefore ? j.firstSeen > seenBefore.slice(0,10) : j.firstSeen === latest;
      const expired = (tab === 'fav' || tab === 'prac') && (a !== null && a > 30 || !byUrl.has(j.url));
      const st = (tab === 'fav' || tab === 'prac') ? p[tab][j.url]?.stage : '';
      return `<button class="item${j.url === selected ? ' sel' : ''}" data-url="${esc(j.url)}">
        <span class="row1">${isNew ? '<em class="new">NEW</em>' : ''}${p.fav[j.url] ? '<em class="heart">❤</em>' : ''}${p.prac[j.url] ? '<em class="prac">🎯</em>' : ''}<strong>${esc(j.title)}</strong></span>
        <span class="co">${esc(j.company)} · ${esc(j.location || '')}</span>
        <span class="row3"><b>${esc(j.salary || '薪资未公开')}</b><i>${esc(when(j))}</i></span>
        <span class="tags">${tab === 'hidden' ? required(j).filter(x => fit(x) === 'no').map(x => chip('× ' + x.label.slice(0, 18), 'warn')).join('') : ''}${chip(j.source)}${j.commissionType === 'only' ? chip('纯佣金','gold') : ''}${st ? chip(st,'green') : ''}${expired ? chip('已超过 30 天','warn') : ''}${tab === 'list' ? r.tags.slice(0,2).map(t => chip(t[0], t[1])).join('') : ''}</span>
      </button>`;
    }).join('') : `<p class="empty">${tab === 'fav' ? '还没有收藏。点职位右边的 ❤ 收藏。' : tab === 'prac' ? '还没有练习的职位。<br>想把某个职位的面试当练习，就在职位右边点「🎯 练习」。和收藏一样可以记已申请、面试中和备注，超过 30 天也会保留。' : tab === 'ni' ? '没有标记无兴趣的职位。' : tab === 'hidden' ? '目前没有职位被移到这里。<br>在「我的条件」把做不到的条件标 ×（例如「日语母语级」「有效汽车驾照」），必需条件里 × 超过 20% 的职位就会自动移到这里，不会删掉。<br><button class="primary" id="go-set">打开我的条件</button>' : '没有符合筛选的职位，试试放宽地区或薪资。'}</p>`;

    if ($('go-set')) $('go-set').onclick = settings;
    if (!rows.find(j => j.url === selected)) selected = rows[0]?.url || '';
    renderDetail(rows.find(j => j.url === selected));

    const upd = data.updatedAt ? new Date(data.updatedAt).toLocaleString('zh-MY', { timeZone:'Asia/Kuala_Lumpur', month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
    $('meta').innerHTML = `<span>资料更新：${esc(upd)}</span><span>每 3 天更新${data.nextUpdate ? ' · 下次约 ' + esc(data.nextUpdate) : ''}</span>`;
    const newCount = g.list.filter(j => seenBefore ? j.firstSeen > seenBefore.slice(0,10) : j.firstSeen === latest).length;
    $('news').hidden = !newCount;
    $('news').innerHTML = newCount ? `<b>${newCount}</b> 个职位是${seenBefore ? '你上次来访之后' : '最近一次更新'}新增的，列表里标了 NEW。` : '';
  }

  function renderDetail(j) {
    const box = $('detail');
    if (!j) { box.innerHTML = '<p class="empty">选择左边的职位查看详情。</p>'; return; }
    const p = P(), r = reasons(j), a = ageDays(j.postedAt);
    const fav = p.fav[j.url], prac = p.prac[j.url], ni = p.ni[j.url];
    const gone = !byUrl.has(j.url) || (a !== null && a > 30);
    const reqs = (j.requirements || []);
    const rq = required(j);
    const pct = rq.length ? Math.round(100 * rq.filter(x => fit(x) === 'no').length / rq.length) : 0;
    const STAGES = ['想申请','已申请','面试中','已拿 offer','不考虑'];
    const stageSel = (kind, rec) => `<select class="stage" data-kind="${kind}" aria-label="${kind === 'fav' ? '收藏' : '练习'}的跟进状态">${STAGES.map(s => `<option${rec.stage === s ? ' selected' : ''}>${s}</option>`).join('')}</select>`;
    box.innerHTML = `
      <div class="d-head">
        <div class="tags">${chip(j.source)}${chip(CATS[store.profile][classify(j)] || '', 'green')}${j.commissionType === 'only' ? chip('纯佣金','gold') : ''}${gone ? chip('已超过 30 天／已下架','warn') : ''}</div>
        <h2>${esc(j.title)}</h2>
        <p class="co">${esc(j.company)} · ${esc(j.location || '')} · ${esc(when(j))}${j.postedAt ? '（' + esc(j.postedAt) + '）' : ''}</p>
        <div class="actions">
          <a class="primary" href="${esc(j.url)}" target="_blank" rel="noopener noreferrer">打开原帖 ↗</a>
          <button data-kind="fav" class="keep ${fav ? 'on' : ''}">${fav ? '❤ 已收藏' : '♡ 收藏'}</button>
          ${fav ? stageSel('fav', fav) : ''}
          <button data-kind="prac" class="keep ${prac ? 'on prac' : ''}">${prac ? '🎯 已加入练习' : '🎯 练习'}</button>
          ${prac ? stageSel('prac', prac) : ''}
          <button id="b-ni" class="${ni ? 'on' : ''}">${ni ? '↩ 恢复到列表' : '🚫 无兴趣'}</button>
          ${(fav || prac) && gone ? '<button id="b-del" class="danger" title="删除">✕ 删除</button>' : ''}
        </div>
      </div>
      <div class="money">
        <div><span>广告薪资</span><b>${esc(j.salary || '未公开')}</b></div>
        <div><span>底薪</span><b>${esc(j.basic || '原帖未单独写')}</b></div>
        <div><span>佣金</span><b>${esc(j.commission || (j.role === 'japanese' ? '—' : '有佣金'))}</b></div>
      </div>
      ${r.tags.length ? `<div class="why"><span>为什么排在这里</span>${r.tags.map(t => chip(t[0], t[1])).join('')}<small>只是参考，不是结论。</small></div>` : ''}
      <section><h3>工作内容</h3><p>${esc(j.summary || '—')}</p></section>
      <section><h3>条件 <small>${rq.length ? `必需 ${rq.length} 项，× ${pct}%` : ''}</small></h3>
        ${reqs.length ? `<ul class="reqs">${reqs.map((x, i) => { const v = fit(x); return `<li><span class="lbl">${esc(x.label)}${x.preferred ? ' <em>加分项</em>' : ''}</span>
          <span class="tri" data-i="${i}">${[['yes','✓'],['no','×'],['unknown','～']].map(([k,t]) => `<button data-v="${k}" class="${v === k ? 'on ' + k : ''}" aria-label="${k}">${t}</button>`).join('')}</span></li>`; }).join('')}</ul>` : '<p>原帖没有列出具体条件。</p>'}
        <p class="hint">同一个条件在所有职位同步。必需条件 × 超过 20% 会移到「不太符合」，刚好 20% 仍显示。</p>
      </section>
      ${fav ? `<section><h3>收藏备注</h3><textarea class="note" data-kind="fav" rows="3" placeholder="面试时间、联系人、想问的问题…">${esc(fav.note || '')}</textarea></section>` : ''}
      ${prac ? `<section><h3>练习备注</h3><textarea class="note" data-kind="prac" rows="3" placeholder="想练什么、被问了什么、下次怎么答更好…">${esc(prac.note || '')}</textarea></section>` : ''}`;

    box.querySelectorAll('button.keep').forEach(b => b.onclick = () => {
      const kind = b.dataset.kind, name = kind === 'fav' ? '收藏' : '练习';
      if (p[kind][j.url]) { if (gone) return confirmDelete(j, kind); delete p[kind][j.url]; toast('已取消' + name); }
      else { p[kind][j.url] = { job: snapshot(j), at: new Date().toISOString(), stage:'想申请' }; delete p.ni[j.url]; toast('已加入「' + name + '」，超过 30 天也会保留'); }
      save(); render();
    });
    $('b-ni').onclick = () => {
      if (ni) { delete p.ni[j.url]; toast('已恢复到列表'); }
      else { p.ni[j.url] = { job: snapshot(j), at: new Date().toISOString() }; delete p.fav[j.url]; delete p.prac[j.url]; toast('已移到「无兴趣」，职位发布满 30 天后自动清除'); selected = ''; }
      save(); render();
    };
    if ($('b-del')) $('b-del').onclick = () => confirmDelete(j, prac && !fav ? 'prac' : (tab === 'prac' ? 'prac' : 'fav'));
    box.querySelectorAll('select.stage').forEach(el => el.onchange = e => { p[el.dataset.kind][j.url].stage = e.target.value; save(); render(); });
    box.querySelectorAll('textarea.note').forEach(el => el.onchange = e => { p[el.dataset.kind][j.url].note = e.target.value; save(); });
    box.querySelectorAll('.tri button').forEach(b => b.onclick = () => {
      const i = +b.parentElement.dataset.i; setFit(reqs[i], b.dataset.v); render();
    });
  }

  function confirmDelete(j, kind = 'fav') {
    const name = kind === 'fav' ? '收藏' : '练习';
    modal(`确定删除这个${name}吗？`, `<p>「${esc(j.title)}」— ${esc(j.company)}</p><p>这个职位已经发布超过 30 天。删除后不能恢复。</p>
      <div class="actions"><button id="m-no">取消</button><button id="m-yes" class="danger">确认删除</button></div>`);
    $('m-no').onclick = () => $('modal').close();
    $('m-yes').onclick = () => { delete P()[kind][j.url]; save(); $('modal').close(); toast('已删除'); render(); };
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
  function settings() {
    const p = P();
    const stats = conditionStats();
    const row = e => { const v = fit(e.sample); return `<li><span class="lbl">${esc(e.label)} <small>${e.n} 个职位</small></span><span class="tri" data-k="${esc(e.k)}">${[['yes','✓'],['no','×'],['unknown','～']].map(([x,t]) => `<button data-v="${x}" class="${v === x ? 'on ' + x : ''}">${t}</button>`).join('')}</span></li>`; };
    const top = stats.filter(e => e.n >= 2), rest = stats.filter(e => e.n < 2);
    modal(`我的条件（${store.profile}）`, `
      <p class="hint">按出现次数排列。标 × 的条件，在一个职位的必需条件里超过 20%，这个职位就会移到「不太符合」。改一次，所有职位一起更新。</p>
      <ul class="reqs">${top.map(row).join('')}</ul>
      ${rest.length ? `<details><summary>只出现一次的条件（${rest.length}）</summary><ul class="reqs">${rest.map(row).join('')}</ul></details>` : ''}
      <h3>备份与换设备</h3>
      <p class="hint">收藏、无兴趣和勾选只存在这个浏览器。换手机或电脑前，先导出，再到新设备导入。</p>
      <div class="actions"><button id="m-exp">导出备份</button><label class="filebtn">导入备份<input id="m-imp" type="file" accept="application/json"></label><button id="m-reset">清除这个档案的勾选</button></div>`);
    $('m-reset').onclick = () => { p.facts = { ...DEFAULT_FACTS[store.profile] }; p.answers = {}; save(); $('modal').close(); toast('已恢复默认勾选'); render(); };
    $('modal-body').querySelectorAll('.tri button').forEach(b => b.onclick = () => {
      const k = b.parentElement.dataset.k;
      if (k.startsWith('fact:')) p.facts[k.slice(5)] = b.dataset.v; else p.answers[k] = b.dataset.v;
      save();
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
  const bindF = (id, key, fn = e => e.target.value) => $(id).addEventListener(id === 'q' ? 'input' : 'change', e => { P().f[key] = fn(e); save(); render(); });
  bindF('q','q'); bindF('f-cat','cat'); bindF('f-area','area'); bindF('f-src','src'); bindF('f-sort','sort');
  bindF('f-min','min', e => +e.target.value || 0); bindF('f-max','max', e => +e.target.value || 0);
  bindF('f-only','only', e => e.target.checked);
  document.querySelectorAll('[data-profile]').forEach(b => b.onclick = () => { store.profile = b.dataset.profile; save(); selected = ''; purge(); render(); });
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; selected = ''; render(); });
  $('list').addEventListener('click', e => {
    const it = e.target.closest('.item'); if (!it) return;
    selected = it.dataset.url; render();
    if (matchMedia('(max-width: 860px)').matches) $('detail').scrollIntoView({ behavior:'smooth' });
  });
  $('open-settings').onclick = settings;

  fetch('jobs.json', { cache:'no-cache' }).then(r => r.json()).then(d => {
    data = d; byUrl = new Map(d.jobs.map(j => [j.url, j]));
    const srcs = [...new Set(d.jobs.map(j => j.source))].sort();
    $('f-src').innerHTML = '<option value="">所有来源</option>' + srcs.map(s => `<option>${esc(s)}</option>`).join('');
    for (const pr of ['KH','JW']) { const keep = store.profile; store.profile = pr; const p = P(); if (!p.lastVisit || Date.now() - Date.parse(p.lastVisit) > 6 * 3600000) { p.prevVisit = p.lastVisit || ''; p.lastVisit = new Date().toISOString(); } purge(); store.profile = keep; }
    save(); render();
  }).catch(() => { $('list').innerHTML = '<p class="empty">资料读取失败，请稍后刷新。</p>'; });
})();
