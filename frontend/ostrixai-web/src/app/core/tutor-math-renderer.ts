/** MATH-VISUAL-02: rendering ONLY, never changes stored messages or inference provenance.
 * Output escapes untrusted content. Use Angular's ordinary [innerHTML] sanitization.
 * Unknown TeX remains literal rather than being misrepresented.
 */
import { cleanMarkdownToText } from './markdown-cleaner';

type Fragment = { html: string; speech: string };
const esc = (s: string): string => s.replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const named: Record<string, [string,string]> = {
  times:['×',' por '], cdot:['·',' por '], div:['÷',' dividido entre '],
  pm:['±',' más o menos '], leq:['≤',' menor o igual que '], geq:['≥',' mayor o igual que '],
  neq:['≠',' distinto de '], approx:['≈',' aproximadamente '],
  pi:['π',' pi '], alpha:['α',' alfa '], beta:['β',' beta '],
  theta:['θ',' theta '], circ:['°',' grados '], infty:['∞',' infinito ']
};
class Parser {
  private i=0;
  private readonly s:string;
  constructor(s:string) { this.s=s; }
  parse():Fragment {
    if(this.s.length>1400) throw Error('Longitud no soportada');
    const r=this.seq(false,0);
    if(this.i!==this.s.length) throw Error('Fórmula incompleta');
    return r;
  }
  private skip():void { while(this.i<this.s.length && /\s/.test(this.s[this.i])) this.i++; }
  private cmd():string {
    const p=this.i;
    while(this.i<this.s.length && /[A-Za-z]/.test(this.s[this.i])) this.i++;
    if(this.i>p) return this.s.slice(p,this.i);
    if(this.i===this.s.length) throw Error('Barra final');
    return this.s[this.i++];
  }
  private group(depth:number):Fragment {
    this.skip();
    if(this.s[this.i]!=='{') throw Error('Se esperaba grupo entre llaves');
    this.i++;
    return this.seq(true,depth+1);
  }
  private textGroup():Fragment {
    this.skip(); if(this.s[this.i]!=='{') throw Error('Texto sin llaves');
    const start=++this.i;
    while(this.i<this.s.length && this.s[this.i]!=='}') {
      if(this.s[this.i]==='{') throw Error('Texto anidado');
      this.i++;
    }
    if(this.s[this.i]!=='}') throw Error('Texto sin cierre');
    const t=this.s.slice(start,this.i++);
    if(t.includes('\\')) throw Error('Macro dentro de texto');
    return {html:esc(t),speech:t};
  }
  private script(depth:number):Fragment {
    this.skip(); const c=this.s[this.i];
    if(c==='{') return this.group(depth+1);
    if(c==='\\') {
      this.i++; const name=this.cmd();
      if(name==='circ') return {html:'°',speech:'grados'};
      if(name==='text'||name==='mathrm') return this.textGroup();
      throw Error('Script no soportado');
    }
    if(c && /[\p{L}\d+\-]/u.test(c)) {this.i++;return {html:esc(c),speech:c};}
    throw Error('Script vacío');
  }
  private seq(close:boolean,depth:number):Fragment {
    if(depth>10) throw Error('Profundidad excesiva');
    let html='',speech='';
    while(this.i<this.s.length) {
      const c=this.s[this.i++];
      if(c==='}') {
        if(!close) throw Error('Llave extra');
        return {html,speech};
      }
      if(c==='{') {
        const r=this.seq(true,depth+1);html+=r.html;speech+=r.speech;continue;
      }
      if(c==='^'||c==='_') {
        const r=this.script(depth+1),tag=c==='^'?'sup':'sub';
        html+=`<${tag} class="os-math-script">${r.html}</${tag}>`;
        speech+=c==='^'?` elevado a ${r.speech}`:` subíndice ${r.speech}`;
        continue;
      }
      if(c!=='\\') {html+=esc(c);speech+=c;continue;}
      const name=this.cmd();
      if(['frac','dfrac','tfrac'].includes(name)) {
        const top=this.group(depth+1),bottom=this.group(depth+1);
        html+=`<span class="os-math-frac"><span class="os-math-num">${top.html}</span><span class="os-math-den">${bottom.html}</span></span>`;
        speech+=` fracción de (${top.speech}) sobre (${bottom.speech}) `;
      } else if(name==='sqrt') {
        const r=this.group(depth+1);
        html+=`<span class="os-math-root">√<span class="os-math-radicand">${r.html}</span></span>`;
        speech+=` raíz cuadrada de ${r.speech} `;
      } else if(['text','mathrm','operatorname'].includes(name)) {
        const r=this.textGroup();html+=r.html;speech+=r.speech;
      } else if(name==='left'||name==='right') {
        // The following bracket is processed normally.
      } else if(named[name]) {html+=named[name][0];speech+=named[name][1];}
      else if([' ',',',';',':','!','quad','qquad'].includes(name)) {html+=' ';speech+=' ';}
      else if(name==='_') {
        const r=this.script(depth+1);
        html+=`<sub class="os-math-script">${r.html}</sub>`;
        speech+=` subíndice ${r.speech}`;
      } else if(['%','{','}','$','&','#'].includes(name)) {html+=esc(name);speech+=name;}
      else if(name==='\\') {html+=' ';speech+=' ';}
      else throw Error('Macro desconocida: '+name);
    }
    if(close) throw Error('Llave sin cerrar');
    return {html,speech};
  }
}
/** MATH-VISUAL-06: detect elementary algebra without treating prose as math. */
function isMath(s:string):boolean {
  const value = s.trim();

  if (!value || value.length > 1400) return false;

  // Supported LaTeX commands are parsed or safely left as literal text.
  if (/\\[A-Za-z]|\\_/.test(value)) return true;

  // Single variables and coefficients.
  if (/^[A-Za-z]$/.test(value)) return true;
  if (/^[+-]?\d+(?:[.,]\d+)?[A-Za-z]$/.test(value)) return true;

  // Isolated numbers.
  if (/^[+-]?\d+(?:[.,]\d+)?$/.test(value)) return true;

  // Elementary equations and algebraic expressions.
  if (!/^[A-Za-z0-9\s+\-*/=^_().,<>×÷≤≥≠]+$/.test(value)) {
    return false;
  }

  // Reject ordinary words to avoid confusing prices with formulas.
  const identifiers = value.match(/[A-Za-z]+/g) ?? [];
  const mathFunctions = ['sin', 'cos', 'tan', 'log', 'ln'];

  if (identifiers.some(word =>
    word.length > 1 && !mathFunctions.includes(word)
  )) {
    return false;
  }

  return /[=+\-*/^_<>×÷≤≥≠]/.test(value);
}
/** String HTML for regular Angular [innerHTML]; HTML entities are escaped before rendering. */
function renderTutorInlineMathHtml(raw:string):string {
  if(!raw) return '';
  // TEXT-POLISH-01: corregir errores conocidos solo al presentar.
  const input=cleanMarkdownToText(raw)
    .replace(/\bPRACTICUEMOS\b/g, 'PRACTIQUEMOS')
    .replace(/\bResolve la siguiente ecuación\b/g, 'Resuelve la siguiente ecuación');
  const delim=/(?<!\\)\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|(?<!\\)\$([^\r\n$]{1,1400})\$/g;
  const plain=(s:string)=>esc(s).replace(/\r?\n/g,'<br>');
  let html='',cursor=0;
  for(const m of input.matchAll(delim)) {
    const start=m.index??0,orig=m[0],body=(m[1]??m[2]??m[3]??m[4]??'').trim();
    html+=plain(input.slice(cursor,start));
    if(!isMath(body)) html+=plain(orig);
    else {
      try {
        // Models sometimes escape the underscore in CO\_2.
        const parsed=new Parser(body.replace(/\\_/g,'_')).parse();
        const cls=m[1]!==undefined||m[2]!==undefined?'os-math-display':'os-math-inline';
        html+=`<span class="${cls}" role="math" aria-label="${esc(parsed.speech.trim())}">${parsed.html}</span>`;
      } catch {html+=plain(orig);}
    }
    cursor=start+orig.length;
  }
  return html+plain(input.slice(cursor));
}


/** MARKDOWN-TABLE-01: safe Markdown tables, preserving math rendering. */
function readTutorTableRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return null;

  const body = trimmed
    .replace(/^\|/, '')
    .replace(/\|$/, '');

  const cells = body.split(/(?<!\\)\|/)
    .map(cell => cell.trim().replace(/\\\|/g, '|'));

  if (cells.length < 2 || cells.length > 10) return null;
  if (cells.some(cell => cell.length > 500)) return null;

  return cells;
}

export function renderTutorMathHtml(raw: string): string {
  if (!raw) return '';

  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const result: string[] = [];
  let plainLines: string[] = [];

  const flushPlain = (): void => {
    if (plainLines.length) {
      result.push(renderTutorInlineMathHtml(plainLines.join('\n')));
      plainLines = [];
    }
  };

  for (let i = 0; i < lines.length;) {
    const header = readTutorTableRow(lines[i]);
    const separator = i + 1 < lines.length
      ? readTutorTableRow(lines[i + 1])
      : null;

    const validTable = header !== null &&
      separator !== null &&
      header.length === separator.length &&
      separator.every(cell => /^:?-{3,}:?$/.test(cell));

    if (!validTable || !header) {
      plainLines.push(lines[i]);
      i++;
      continue;
    }

    const rows: string[][] = [];
    let next = i + 2;

    while (next < lines.length && rows.length < 100) {
      const row = readTutorTableRow(lines[next]);

      if (!row || row.length !== header.length) break;
      if (row.every(cell => /^:?-{3,}:?$/.test(cell))) break;

      rows.push(row);
      next++;
    }

    flushPlain();

    const headings = header.map(cell =>
      `<th scope="col">${renderTutorInlineMathHtml(cell)}</th>`
    ).join('');

    const body = rows.map(row =>
      '<tr>' + row.map(cell =>
        `<td>${renderTutorInlineMathHtml(cell)}</td>`
      ).join('') + '</tr>'
    ).join('');

    result.push(
      '<div class="os-tutor-table-scroll">' +
      '<table class="os-tutor-table">' +
      `<thead><tr>${headings}</tr></thead>` +
      `<tbody>${body}</tbody>` +
      '</table></div>'
    );

    i = next;
  }

  flushPlain();
  return result.join('');
}