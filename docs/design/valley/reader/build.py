import re, html, sys, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = sys.argv[1]

def inline(t):
    t = html.escape(t, quote=False)
    t = re.sub(r'`([^`]+)`', r'<code>\1</code>', t)
    t = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', t)
    t = re.sub(r'(?<![*\w])\*([^*\n]+)\*(?!\*)', r'<em>\1</em>', t)
    # links: keep text only for relative doc links; real http links stay links
    def link(m):
        text, href = m.group(1), m.group(2)
        if href.startswith('http'):
            return f'<a href="{href}" target="_blank" rel="noopener">{text}</a>'
        return text
    t = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', link, t)
    return t

def md(src, drop_h1=True):
    lines = src.split('\n')
    out, i = [], 0
    def para(buf):
        if buf: out.append('<p>' + inline(' '.join(buf)) + '</p>')
    buf = []
    while i < len(lines):
        ln = lines[i]
        if not ln.strip():
            para(buf); buf = []; i += 1; continue
        if ln.startswith('```'):
            para(buf); buf = []
            i += 1; code = []
            while i < len(lines) and not lines[i].startswith('```'):
                code.append(lines[i]); i += 1
            out.append('<pre><code>' + html.escape('\n'.join(code)) + '</code></pre>')
            i += 1; continue
        if ln.startswith('>'):
            para(buf); buf = []
            quote = []
            while i < len(lines) and lines[i].startswith('>'):
                quote.append(lines[i].lstrip('>').strip()); i += 1
            out.append('<blockquote>' + inline(' '.join(quote)) + '</blockquote>')
            continue
        m = re.match(r'^(#{1,6})\s+(.*)', ln)
        if m:
            para(buf); buf = []
            lvl = len(m.group(1))
            if not (lvl == 1 and drop_h1):
                tag = {1:'h3',2:'h3',3:'h4'}.get(lvl,'h5')
                out.append(f'<{tag}>{inline(m.group(2))}</{tag}>')
            i += 1; continue
        if ln.startswith('|'):
            para(buf); buf = []
            rows = []
            while i < len(lines) and lines[i].startswith('|'):
                cells = [c.strip() for c in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r':?-+:?', c) for c in cells):
                    rows.append(cells)
                i += 1
            head, body = rows[0], rows[1:]
            t = ['<div class="tbl"><table><thead><tr>' + ''.join(f'<th>{inline(h)}</th>' for h in head) + '</tr></thead><tbody>']
            for r in body:
                t.append('<tr>' + ''.join(f'<td data-l="{html.escape(re.sub(r"[*`]","",head[k]) if k < len(head) else "")}">{inline(c)}</td>' for k, c in enumerate(r)) + '</tr>')
            t.append('</tbody></table></div>')
            out.append(''.join(t)); continue
        m = re.match(r'^(\s*)([-*]|\d+\.)\s+(.*)', ln)
        if m:
            para(buf); buf = []
            ordered = m.group(2)[0].isdigit()
            items = []
            while i < len(lines):
                mm = re.match(r'^(\s*)([-*]|\d+\.)\s+(.*)', lines[i])
                if mm:
                    items.append([len(mm.group(1)), mm.group(3)]); i += 1
                elif lines[i].startswith('  ') and lines[i].strip() and items:
                    items[-1][1] += ' ' + lines[i].strip(); i += 1
                else:
                    break
            tag = 'ol' if ordered else 'ul'
            h = [f'<{tag}>']
            depth0 = items[0][0]
            open_sub = False
            for ind, txt in items:
                if ind > depth0 and not open_sub:
                    h[-1] = h[-1][:-5] if h[-1].endswith('</li>') else h[-1]
                    h.append('<ul>'); open_sub = True
                elif ind <= depth0 and open_sub:
                    h.append('</ul></li>'); open_sub = False
                h.append(f'<li>{inline(txt)}</li>')
            if open_sub: h.append('</ul></li>')
            h.append(f'</{tag}>')
            out.append(''.join(h)); continue
        buf.append(ln.strip()); i += 1
    para(buf)
    return '\n'.join(out)

def read(p): return open(os.path.join(ROOT, p)).read()
def status_of(src):
    m = re.search(r'^Status:\s*\*\*([^*]+)\*\*', src, re.M)
    return m.group(1) if m else ''

SYSTEMS = [('valley.md','The valley'),('posts.md','Job posts'),('bonfire.md','The bonfire'),('return.md','The return moment'),('scouts.md','Scouts'),('forge.md','The Forge loop'),('school.md','The School'),('commons.md','The commons'),('defence.md','The raid as defence'),('later.md','Later')]

def section(src, title):
    m = re.search(r'^## ' + re.escape(title) + r'\n(.*?)(?=^## |\Z)', src, re.M | re.S)
    return m.group(1) if m else ''

qs = read('questions.md')
waiting = re.findall(r'^### Q(\d+)\. (.*)', section(qs, 'Waiting on Misa'), re.M)
answered = re.findall(r'^### Q(\d+)\.', section(qs, 'Answered'), re.M)
rounds = sorted(set(re.findall(r'asked, round (\d+)', section(qs, 'Waiting on Misa'))))
if waiting:
    wait = f'<a href="#questions">Round {", ".join(rounds)}: ' + ', '.join('Q' + n for n, _ in waiting) + '</a>'
else:
    wait = 'Nothing right now'
cur = re.search(r'^\| (\S+)\s*\| \*\*([^*]+)\*\*.*\*\*current\*\*', read('roadmap.md'), re.M)
phase = f'{cur.group(1)} of 6: {html.escape(cur.group(2).rstrip("."))}' if cur else 'see the roadmap'
decided = f'{len(answered)} answer{"s" if len(answered) != 1 else ""} recorded'

sections = []
readme = read('README.md')
sections.append(('overview','Overview', md(readme)))
sections.append(('questions','Questions', md(qs)))
sections.append(('goals','Goals', md(read('goals.md'))))
sections.append(('roadmap','Roadmap', md(read('roadmap.md'))))
sections.append(('scrap','Scrap list', md(read('scrap-list.md'))))
sys_html = []
for f, name in SYSTEMS:
    s = read('systems/'+f)
    st = status_of(s)
    first = re.search(r'^# (.*)', s, re.M).group(1)
    sys_html.append(f'<details class="sys" id="sys-{f[:-3]}"><summary><span class="sname">{inline(first)}</span><span class="pill">{html.escape(st)}</span></summary><div class="sbody">{md(s)}</div></details>')
sections.append(('systems','Systems', '<p class="lead">Tap a system to open it. Rules are numbered (V-POST-1…) so reviews and the simulator can point at them.</p>' + ''.join(sys_html)))
sections.append(('economy','Economy lab', md(read('economy/model.md'))))
sections.append(('process','Process', md(read('deciding.md')) + md(read('process.md'))))
sections.append(('log','Log', md(read('log.md'))))

nav = ''.join(f'<a href="#{sid}">{name}</a>' for sid, name, _ in sections)
body = ''.join(f'<section id="{sid}"><h2>{name}</h2>{content}</section>' for sid, name, content in sections)
tpl = open(os.path.join(os.path.dirname(__file__), 'shell.html')).read()
for k, v in {'NAV': nav, 'BODY': body, 'WAIT': wait, 'PHASE': phase, 'DECIDED': decided}.items():
    tpl = tpl.replace('{{' + k + '}}', v)
open(OUT, 'w').write(tpl)
print('ok', len(body), '| waiting:', [n for n, _ in waiting], '| phase:', phase, '|', decided)
