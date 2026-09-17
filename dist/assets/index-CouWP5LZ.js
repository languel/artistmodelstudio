(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))s(i);new MutationObserver(i=>{for(const r of i)if(r.type==="childList")for(const n of r.addedNodes)n.tagName==="LINK"&&n.rel==="modulepreload"&&s(n)}).observe(document,{childList:!0,subtree:!0});function t(i){const r={};return i.integrity&&(r.integrity=i.integrity),i.referrerPolicy&&(r.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?r.credentials="include":i.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function s(i){if(i.ep)return;i.ep=!0;const r=t(i);fetch(i.href,r)}})();class T{constructor(e,t,s="generic"){if(new.target===T)throw new TypeError("Cannot construct Artist instances directly.");this.id=e,this.name=t,this.type=s}async generate(e){throw new Error("generate() must be implemented by subclass.")}}function C(a){if(!a)return{version:1,actions:[]};let e=[];Array.isArray(a)?e=a:typeof a=="object"&&(Array.isArray(a.actions)?e=a.actions:Array.isArray(a.program)?e=a.program:Array.isArray(a.drawing)&&(e=a.drawing));const t=e.map(s=>K(s)).filter(Boolean);return{version:a.version||1,actions:t}}function K(a){if(!a||typeof a!="object")return null;let t=(a.op||a.type||a.command||"").trim().toLowerCase();(t==="bleed"||t==="brush_bleed")&&(t="brush.bleed"),(t==="texture"||t==="brush_texture")&&(t="brush.texture"),(t==="hatch"||t==="brush_hatch")&&(t="brush.hatch"),(t==="weight"||t==="strokeweight"||t==="brush_weight")&&(t=a.brush?"brush.weight":"strokeWidth"),t==="strokewidth"&&(t="strokeWidth"),t==="nofill"&&(t="noFill"),t==="nostroke"&&(t="noStroke"),(t==="mirror_x"||t==="mirrorx")&&(t="mirrorX"),(t==="mirror_y"||t==="mirrory")&&(t="mirrorY");const s={op:t};switch(a.color!==void 0&&(s.color=a.color),a.opacity!==void 0&&(s.opacity=Number(a.opacity)),t){case"background":case"clear":s.color===void 0&&a.fill!==void 0&&(s.color=a.fill);break;case"fill":a.opacity!==void 0&&(s.opacity=Number(a.opacity)),a.bleed!==void 0&&(s.bleed=Number(a.bleed)),a.texture!==void 0&&(s.texture=Number(a.texture));break;case"stroke":a.width!==void 0&&(s.width=Number(a.width));break;case"strokeWidth":case"brush.weight":s.width=Number(a.width??a.weight??a.value??1);break;case"brush.bleed":s.amount=Number(a.amount??a.value??a.bleed??.2);break;case"brush.texture":s.amount=Number(a.amount??a.value??a.texture??.5);break;case"brush.hatch":s.distance=Number(a.distance??a.spacing??10),s.angle=Number(a.angle??45),a.style&&(s.style=a.style);break;case"circle":s.x=Number(a.x??0),s.y=Number(a.y??0),a.diameter!==void 0?s.diameter=Number(a.diameter):a.radius!==void 0||a.r!==void 0?s.diameter=Number(a.radius??a.r)*2:a.d!==void 0?s.diameter=Number(a.d):s.diameter=.2;break;case"rect":s.x=Number(a.x??0),s.y=Number(a.y??0),s.width=Number(a.width??a.w??.2),s.height=Number(a.height??a.h??.2),a.color!==void 0&&(s.color=a.color),a.fill!==void 0&&(s.fill=!!a.fill);break;case"line":s.x1=Number(a.x1??0),s.y1=Number(a.y1??0),s.x2=Number(a.x2??0),s.y2=Number(a.y2??0),a.color!==void 0&&(s.color=a.color);break;case"polygon":case"polyline":Array.isArray(a.points)?s.points=a.points.map(i=>Array.isArray(i)?[Number(i[0]),Number(i[1])]:typeof i=="object"&&i!==null?[Number(i.x),Number(i.y)]:[0,0]):s.points=[],a.color!==void 0&&(s.color=a.color);break;case"pixel":s.x=Math.round(Number(a.x??0)),s.y=Math.round(Number(a.y??0)),s.color=a.color??0;break;case"hline":s.y=Math.round(Number(a.y??0)),s.x1=Math.round(Number(a.x1??0)),s.x2=Math.round(Number(a.x2??0)),s.color=a.color??0;break;case"vline":s.x=Math.round(Number(a.x??0)),s.y1=Math.round(Number(a.y1??0)),s.y2=Math.round(Number(a.y2??0)),s.color=a.color??0;break;case"palette":s.colors=Array.isArray(a.colors)?a.colors:[];break;case"mirrorX":s.enabled=a.enabled!==void 0?!!a.enabled:!0;break;case"mirrorY":s.enabled=a.enabled!==void 0?!!a.enabled:!0;break;default:Object.assign(s,a),s.op=t;break}return s}class Q extends T{constructor(){super("mock","Procedural Artist (Instant/Offline)","procedural")}async generate(e){const t=e.count||4,s=(e.prompt||"three red flowers").toLowerCase(),i=e.mediumCapabilities?.coordinateSystem==="pixel",r=e.mediumCapabilities?.id==="watercolor",n=[];for(let o=0;o<t;o++){const l=performance.now(),c=o;let u;e.feedback&&e.previousProgram?u=this.applyCritique(e.previousProgram,e.feedback,c,i):e.previousProgram?u=this.generateVariation(e.previousProgram,c,i):i?u=this.generatePixelProgram(s,c,e.mediumCapabilities):u=this.generateVectorProgram(s,c,r);const d=Math.round(performance.now()-l)+Math.round(Math.random()*20+10);n.push({program:C(u),generationTimeMs:d,rawResponse:JSON.stringify(u,null,2),warnings:[]})}return n}generateVectorProgram(e,t,s){const i=e.includes("red")||e.includes("rose")||e.includes("cherry"),r=e.includes("blue")||e.includes("sky")||e.includes("ocean"),n=e.includes("flower")||e.includes("blossom")||e.includes("plant")||!e.includes("mountain"),o=i?"#ce526d":r?"#3a72a0":"#4a8505",l=i?"#e8899e":r?"#78a6cf":"#88b54b",c="#3e6341",d=[{op:"background",color:s?"#faf7f2":"#f5f5f5"}];if(s&&(d.push({op:"brush.bleed",amount:.2+t*.05}),d.push({op:"brush.texture",amount:.4+t*.03}),t===2&&d.push({op:"brush.hatch",distance:12,angle:45})),n)for(let m=0;m<3;m++){const y=-.5+m*.45+(t*.04-.06),p=-.1+(t%2===0?.05:-.05)*m,b=-.15-t*.03;d.push({op:"stroke",color:c,width:2.5}),d.push({op:"line",x1:y,y1:p,x2:y-b,y2:.65}),d.push({op:"noStroke"}),d.push({op:"fill",color:m%2===0?o:l,opacity:.85}),d.push({op:"circle",x:y,y:p,diameter:.25+(m===1?.08:0)+t*.02}),d.push({op:"fill",color:"#ffde59",opacity:.9}),d.push({op:"circle",x:y,y:p,diameter:.08})}else d.push({op:"fill",color:o,opacity:.8}),d.push({op:"polygon",points:[[-.8+t*.05,.4],[-.3+t*.05,-.3],[.2+t*.05,.4]]}),d.push({op:"fill",color:l,opacity:.7}),d.push({op:"polygon",points:[[-.2,.4],[.4,-.2],[.8,.4]]});return{version:1,actions:d}}generatePixelProgram(e,t,s){const i=s?.dimensions?.cols||32,r=s?.dimensions?.rows||48,o=[{op:"palette",colors:["#16151c","#693a32","#c95267","#e3b86c","#eee4c8"]},{op:"background",color:0},{op:"mirrorX",enabled:t%2===0}],l=Math.floor(i/2),c=Math.floor(r/2)+(t*2-3);return o.push({op:"rect",x:l-4,y:c-4,width:8,height:8,color:2}),o.push({op:"rect",x:l-2,y:c-2,width:4,height:4,color:3}),o.push({op:"pixel",x:l,y:c,color:4}),o.push({op:"vline",x:l,y1:c+4,y2:c+16,color:1}),o.push({op:"hline",y:c+10,x1:l-4,x2:l,color:1}),{version:1,actions:o}}generateVariation(e,t,s){return{version:1,actions:JSON.parse(JSON.stringify(e.actions||[])).map(r=>{const n={...r},o=(t-1.5)*.06;return s?(n.x!==void 0&&(n.x=Math.round(n.x+(t%2===0?1:-1))),n.y!==void 0&&(n.y=Math.round(n.y+(t>1?1:-1)))):(n.x!==void 0&&(n.x=Number((n.x+o).toFixed(3))),n.y!==void 0&&(n.y=Number((n.y+o*.5).toFixed(3))),n.diameter!==void 0&&(n.diameter=Math.max(.05,Number((n.diameter*(1+o*.5)).toFixed(3)))),n.width!==void 0&&(n.width=Math.max(.05,Number((n.width*(1+o*.5)).toFixed(3))))),n})}}applyCritique(e,t,s,i){const r=JSON.parse(JSON.stringify(e.actions||[])),n=t.toLowerCase(),o=n.includes("left"),l=n.includes("empty")||n.includes("space")||n.includes("sparse"),c=n.includes("red");return{version:1,actions:r.map(u=>{const d={...u};return o&&(d.x!==void 0&&(d.x=i?d.x-3:d.x-.2),d.x1!==void 0&&(d.x1=i?d.x1-3:d.x1-.2),d.x2!==void 0&&(d.x2=i?d.x2-3:d.x2-.2)),l&&(d.diameter!==void 0&&(d.diameter=d.diameter*.75),d.width!==void 0&&d.op!=="palette"&&(d.width=d.width*.75),d.height!==void 0&&(d.height=d.height*.75)),c&&d.color&&typeof d.color=="string"&&d.color.startsWith("#")&&d.op!=="background"&&(d.color="#e0284f"),d})}}}function J(a){const e=a.coordinateSystem==="pixel";if([...a.core||[],...a.extensions||[]],e){const s=a.dimensions?.cols||32,i=a.dimensions?.rows||48;return`You are a discrete pixel-artist model emitting drawing instructions for a ${s}x${i} pixel grid.

COORDINATES:
- Discrete integer coordinates: x from 0 to ${s-1}, y from 0 to ${i-1}.
- (0, 0) is top-left, (${s-1}, ${i-1}) is bottom-right.
- Palette colors are integer indices (0 to 4) or hex color strings.

AVAILABLE ACTIONS:
- {"op": "palette", "colors": ["#16151c", "#693a32", "#c96a55", "#e3b86c", "#eee4c8"]}
- {"op": "background", "color": 0}
- {"op": "mirrorX", "enabled": true}
- {"op": "mirrorY", "enabled": true}
- {"op": "pixel", "x": 16, "y": 24, "color": 2}
- {"op": "hline", "y": 20, "x1": 10, "x2": 22, "color": 3}
- {"op": "vline", "x": 16, "y1": 10, "y2": 30, "color": 1}
- {"op": "line", "x1": 5, "y1": 5, "x2": 25, "y2": 25, "color": 2}
- {"op": "rect", "x": 10, "y": 10, "width": 12, "height": 8, "color": 3, "fill": true}
- {"op": "polygon", "points": [[16, 5], [25, 20], [7, 20]], "color": 2}

OUTPUT FORMAT:
Return strictly a valid JSON drawing program with:
{
  "version": 1,
  "actions": [ ... ]
}
No markdown outside the json block, no explanations.`}return`You are a creative coding artist generating drawing actions.

CANVAS COORDINATES:
- Normalized 2D coordinates: x: -1.0 to 1.0, y: -1.0 to 1.0.
- (0.0, 0.0) is the center of the canvas.
- (-1.0, -1.0) is top-left, (1.0, 1.0) is bottom-right.
- diameter, width, height are scaled between 0.05 and 1.5.

AVAILABLE ACTIONS:
- {"op": "background", "color": "#faf7f2"}
- {"op": "fill", "color": "#ce526d", "opacity": 0.8}
- {"op": "noFill"}
- {"op": "stroke", "color": "#222222", "width": 2}
- {"op": "noStroke"}
- {"op": "strokeWidth", "width": 2}
- {"op": "circle", "x": -0.4, "y": -0.2, "diameter": 0.5}
- {"op": "rect", "x": 0.1, "y": 0.2, "width": 0.4, "height": 0.3}
- {"op": "line", "x1": -0.5, "y1": -0.5, "x2": 0.5, "y2": 0.5}
- {"op": "polygon", "points": [[-0.2, -0.2], [0.2, -0.2], [0.1, 0.3], [-0.1, 0.3]]}
- {"op": "polyline", "points": [[-0.3, 0], [0, -0.3], [0.3, 0]]}
${a.id==="watercolor"?`
WATERCOLOR EXTENSIONS:
- {"op": "brush.bleed", "amount": 0.3}  (0.0 to 1.0: pigment bleeding)
- {"op": "brush.texture", "amount": 0.5} (0.0 to 1.0: paper texture grain)
- {"op": "brush.hatch", "distance": 10, "angle": 45} (organic cross-hatching)
- {"op": "brush.weight", "width": 2.5} (fluid brush stroke thickness)
`:""}

OUTPUT FORMAT:
Return strictly a valid JSON drawing program with:
{
  "version": 1,
  "actions": [ ... ]
}
No markdown outside the json block, no explanations.`}function _({prompt:a,previousProgram:e,feedback:t}){return t&&e?`Base artistic prompt: "${a}"

Current parent drawing program:
${JSON.stringify(e,null,2)}

HUMAN CRITIQUE:
"${t}"

TASK: Revise the program to directly address the critique while keeping the core subject intact.
Output the complete revised JSON drawing program.`:e?`Base artistic prompt: "${a}"

Parent drawing program:
${JSON.stringify(e,null,2)}

TASK: Generate a creative variation of this drawing. Preserve the overall palette and subject identity, but vary the arrangement, scale, angles, and detail.
Output the complete variation JSON drawing program.`:`Create a drawing for: "${a}".
Produce an expressive, balanced composition using the available actions.
Output the complete JSON drawing program.`}class Z extends T{constructor(e={}){super(e.id||"ollama",e.name||"Ollama Local Model","ollama"),this.endpoint=e.endpoint||"http://localhost:11434",this.model=e.model||"liquidai/lfm2.5-1.2b-instruct:latest",this.temperature=e.temperature??.7,this.maxTokens=e.maxTokens??1500}async fetchAvailableModels(){try{const e=await fetch(`${this.endpoint}/api/tags`);if(!e.ok)throw new Error(`HTTP ${e.status}`);return((await e.json()).models||[]).map(s=>s.name)}catch(e){return console.warn("Failed to fetch Ollama models:",e.message),[]}}async generate(e){const t=e.count||4,s=J(e.mediumCapabilities),i=_(e),r=[],n=[];for(let l=0;l<t;l++){const c=(e.settings?.seed??Date.now())+l*1e3,u=Math.min(1,(this.temperature??.7)+(l>0?.05*l:0));n.push(this.generateSingleCandidate({systemPrompt:s,userPrompt:i,seed:c,temperature:u,model:e.settings?.model||this.model}))}const o=await Promise.allSettled(n);for(let l=0;l<o.length;l++){const c=o[l];c.status==="fulfilled"&&c.value?r.push(c.value):r.push({program:{version:1,actions:[]},generationTimeMs:0,rawResponse:"",warnings:[`Generation failed for candidate ${String.fromCharCode(65+l)}: ${c.reason?.message||"Unknown error"}`]})}return r}async generateSingleCandidate({systemPrompt:e,userPrompt:t,seed:s,temperature:i,model:r}){const n=performance.now(),o=[],l={model:r||this.model,messages:[{role:"system",content:e},{role:"user",content:t}],format:"json",stream:!1,options:{temperature:i,seed:s}};let c="",u=null;try{const m=await fetch(`${this.endpoint}/api/chat`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(l)});if(!m.ok)throw new Error(`Ollama request failed: HTTP ${m.status} ${m.statusText}`);const y=await m.json();c=y.message?.content||y.response||"",u=this.extractAndParseJSON(c,o)}catch(m){o.push(`Ollama API error: ${m.message}`)}const d=Math.round(performance.now()-n);return{program:C(u),generationTimeMs:d,rawResponse:c,warnings:o}}extractAndParseJSON(e,t){if(!e)return null;let s=e.trim();const i=s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);i&&(s=i[1].trim());try{return JSON.parse(s)}catch{}const r=s.indexOf("{"),n=s.lastIndexOf("}");if(r!==-1&&n!==-1&&n>r){const o=s.slice(r,n+1);try{return JSON.parse(o)}catch{const c=o.replace(/,\s*([}\]])/g,"$1");try{return JSON.parse(c)}catch(u){t.push(`JSON repair failed: ${u.message}`)}}}return t.push("Could not parse model output as JSON."),null}}const ee="modulepreload",te=function(a){return"/"+a},F={},H=function(e,t,s){let i=Promise.resolve();if(t&&t.length>0){let n=function(c){return Promise.all(c.map(u=>Promise.resolve(u).then(d=>({status:"fulfilled",value:d}),d=>({status:"rejected",reason:d}))))};document.getElementsByTagName("link");const o=document.querySelector("meta[property=csp-nonce]"),l=o?.nonce||o?.getAttribute("nonce");i=n(t.map(c=>{if(c=te(c),c in F)return;F[c]=!0;const u=c.endsWith(".css"),d=u?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${c}"]${d}`))return;const h=document.createElement("link");if(h.rel=u?"stylesheet":ee,u||(h.as="script"),h.crossOrigin="",h.href=c,l&&h.setAttribute("nonce",l),document.head.appendChild(h),u)return new Promise((m,y)=>{h.addEventListener("load",m),h.addEventListener("error",()=>y(new Error(`Unable to preload CSS for ${c}`)))})}))}function r(n){const o=new Event("vite:preloadError",{cancelable:!0});if(o.payload=n,window.dispatchEvent(o),!o.defaultPrevented)throw n}return i.then(n=>{for(const o of n||[])o.status==="rejected"&&r(o.reason);return e().catch(r)})};let A=null,R=null;const se=[{id:"HuggingFaceTB/SmolLM-360M-Instruct",name:"SmolLM 360M (Fast, ~200MB)"},{id:"onnx-community/Qwen2.5-0.5B-Instruct",name:"Qwen 2.5 0.5B (~350MB)"},{id:"onnx-community/gemma-2-2b-it",name:"Gemma 2 2B (~1.5GB, High VRAM)"}];class ie extends T{constructor(e={}){super(e.id||"webgpu",e.name||"In-Browser WebGPU (Transformers.js)","webgpu"),this.modelId=e.modelId||"HuggingFaceTB/SmolLM-360M-Instruct",this.dtype=e.dtype||"q4",this.onProgress=e.onProgress||null,this.isLoading=!1,this.isReady=!1,this.device=this.checkWebGPUSupport()?"webgpu":"wasm"}checkWebGPUSupport(){return typeof navigator<"u"&&!!navigator.gpu}async initPipeline(e=this.modelId,t=null){if(A&&R===e)return A;this.isLoading=!0;try{const{pipeline:s}=await H(async()=>{const{pipeline:i}=await import("./transformers.web-CmDM3vLR.js");return{pipeline:i}},[]);return A=await s("text-generation",e,{device:this.device,dtype:this.dtype,progress_callback:i=>{t&&t(i),this.onProgress&&this.onProgress(i)}}),R=e,this.isReady=!0,A}catch(s){throw console.error("Failed to initialize WebGPU pipeline:",s),s}finally{this.isLoading=!1}}async generate(e){const t=e.count||4,s=J(e.mediumCapabilities),i=_(e),r=[];(!A||R!==(e.settings?.modelId||this.modelId))&&await this.initPipeline(e.settings?.modelId||this.modelId,e.onProgress);for(let n=0;n<t;n++){const o=performance.now(),l=[];let c="",u=null;try{const m=await A([{role:"system",content:s},{role:"user",content:i}],{max_new_tokens:e.settings?.maxTokens||600,temperature:(e.settings?.temperature||.7)+n*.05,do_sample:!0});if(Array.isArray(m)&&m[0]?.generated_text){const y=m[0].generated_text,p=Array.isArray(y)?y[y.length-1]:y;c=typeof p=="object"?p.content:String(p)}else c=JSON.stringify(m);u=this.extractJSON(c,l)}catch(h){l.push(`WebGPU inference error: ${h.message}`)}const d=Math.round(performance.now()-o);r.push({program:C(u),generationTimeMs:d,rawResponse:c,warnings:l})}return r}extractJSON(e,t){if(!e)return null;let s=e.trim();const i=s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);i&&(s=i[1].trim());const r=s.indexOf("{"),n=s.lastIndexOf("}");if(r!==-1&&n!==-1&&n>r){const o=s.slice(r,n+1);try{return JSON.parse(o)}catch{try{return JSON.parse(o.replace(/,\s*([}\]])/g,"$1"))}catch(c){t.push(`WebGPU JSON parse warning: ${c.message}`)}}}return t.push("Model response did not contain valid JSON."),null}}class re{constructor(){this.artists=new Map;const e=new Q,t=new Z,s=new ie;this.register(e),this.register(t),this.register(s),this.activeId="mock"}register(e){if(!e||!e.id)throw new Error("Artist requires an id property.");this.artists.set(e.id,e)}get(e){return this.artists.get(e)}getActive(){return this.artists.get(this.activeId)||this.artists.get("mock")}setActive(e){this.artists.has(e)&&(this.activeId=e)}list(){return Array.from(this.artists.values()).map(e=>({id:e.id,name:e.name,type:e.type}))}}const ae=new re,I=["background","clear","fill","noFill","stroke","noStroke","strokeWidth","line","circle","rect","polygon","polyline"],U=["brush.bleed","brush.texture","brush.hatch","brush.weight"],X=["pixel","hline","vline","rect","line","polygon","palette","mirrorX","mirrorY"],ne=["#16151c","#693a32","#c96a55","#e3b86c","#eee4c8"];function E(a,e=null){const t=[],s=[];if(!a||typeof a!="object")return{valid:!1,errors:['Program must be an object with an "actions" array.'],warnings:s};if(!Array.isArray(a.actions))return{valid:!1,errors:['Program must contain an "actions" array.'],warnings:s};a.actions.length===0&&s.push("Program contains no actions.");const i=new Set(e?[...e.core||[],...e.extensions||[]]:[...I,...U,...X]);return a.actions.forEach((r,n)=>{if(!r||typeof r!="object"){t.push(`Action [${n}] is not an object.`);return}const o=r.op;if(!o){t.push(`Action [${n}] is missing "op" command.`);return}switch(i.has(o)||s.push(`Action [${n}] (${o}) is not officially supported by this medium.`),o){case"circle":(typeof r.x!="number"||typeof r.y!="number")&&t.push(`Action [${n}] (circle) requires numeric "x" and "y".`),(typeof r.diameter!="number"||r.diameter<=0)&&s.push(`Action [${n}] (circle) should have a positive numeric "diameter".`);break;case"rect":(typeof r.x!="number"||typeof r.y!="number")&&t.push(`Action [${n}] (rect) requires numeric "x" and "y".`),(typeof r.width!="number"||typeof r.height!="number")&&t.push(`Action [${n}] (rect) requires numeric "width" and "height".`);break;case"line":(typeof r.x1!="number"||typeof r.y1!="number"||typeof r.x2!="number"||typeof r.y2!="number")&&t.push(`Action [${n}] (line) requires numeric "x1", "y1", "x2", "y2".`);break;case"polygon":case"polyline":(!Array.isArray(r.points)||r.points.length<2)&&t.push(`Action [${n}] (${o}) requires an array of at least 2 points.`);break;case"pixel":(typeof r.x!="number"||typeof r.y!="number")&&t.push(`Action [${n}] (pixel) requires numeric "x" and "y".`);break}}),{valid:t.length===0,errors:t,warnings:s}}class N{constructor(e,t){if(new.target===N)throw new TypeError("Cannot construct Medium instances directly.");this.id=e,this.name=t}capabilities(){return{id:this.id,name:this.name,coordinateSystem:"normalized",core:[],extensions:[]}}reset(e={}){}async render(e){throw new Error("render() must be implemented by subclass.")}async snapshot(){throw new Error("snapshot() must be implemented by subclass.")}validate(e){return E(e,this.capabilities())}}class oe extends N{constructor(e={}){super("flat","Flat Canvas"),this.width=e.width||400,this.height=e.height||400,typeof document<"u"&&(this.canvas=document.createElement("canvas"),this.canvas.width=this.width,this.canvas.height=this.height,this.ctx=this.canvas.getContext("2d"))}capabilities(){return{id:this.id,name:this.name,coordinateSystem:"normalized",range:{x:[-1,1],y:[-1,1]},core:[...I],extensions:[]}}reset(e={}){e.width&&(this.width=e.width),e.height&&(this.height=e.height),this.canvas&&(this.canvas.width=this.width,this.canvas.height=this.height,this.ctx=this.canvas.getContext("2d"),this.ctx.clearRect(0,0,this.width,this.height))}toX(e){return(e+1)*.5*this.width}toY(e){return(e+1)*.5*this.height}toSize(e){return e*.5*Math.min(this.width,this.height)}async render(e){const t=performance.now(),s=[];if(!this.canvas&&typeof document<"u"&&(this.canvas=document.createElement("canvas"),this.canvas.width=this.width,this.canvas.height=this.height,this.ctx=this.canvas.getContext("2d")),!this.ctx)return{image:null,width:this.width,height:this.height,warnings:["Canvas 2D context unavailable."],executionTimeMs:0};const i=this.ctx;i.save(),i.clearRect(0,0,this.width,this.height),i.fillStyle="#ffffff",i.fillRect(0,0,this.width,this.height);let r=!0,n=!1,o="#333333",l=1,c="#111111",u=1,d=1;const h=C(e);for(const p of h.actions)try{switch(p.op){case"background":case"clear":i.fillStyle=p.color||"#ffffff",i.fillRect(0,0,this.width,this.height);break;case"fill":r=!0,o=p.color||"#000000",p.opacity!==void 0&&(l=p.opacity);break;case"noFill":r=!1;break;case"stroke":n=!0,c=p.color||"#000000",p.width!==void 0&&(d=p.width),p.opacity!==void 0&&(u=p.opacity);break;case"noStroke":n=!1;break;case"strokeWidth":d=p.width??1;break;case"circle":{const b=this.toX(p.x),g=this.toY(p.y),v=Math.max(.5,this.toSize(p.diameter)*.5);i.beginPath(),i.arc(b,g,v,0,Math.PI*2),r&&(i.save(),i.globalAlpha=l,i.fillStyle=o,i.fill(),i.restore()),n&&(i.save(),i.globalAlpha=u,i.strokeStyle=c,i.lineWidth=d,i.stroke(),i.restore());break}case"rect":{const b=this.toX(p.x),g=this.toY(p.y),v=this.toSize(p.width),x=this.toSize(p.height),f=b-v*.5,S=g-x*.5;i.beginPath(),i.rect(f,S,v,x),(r||p.color)&&(i.save(),i.globalAlpha=l,i.fillStyle=p.color||o,i.fill(),i.restore()),n&&(i.save(),i.globalAlpha=u,i.strokeStyle=c,i.lineWidth=d,i.stroke(),i.restore());break}case"line":{const b=this.toX(p.x1),g=this.toY(p.y1),v=this.toX(p.x2),x=this.toY(p.y2);i.beginPath(),i.moveTo(b,g),i.lineTo(v,x),i.save(),i.globalAlpha=u,i.strokeStyle=p.color||c,i.lineWidth=d,i.stroke(),i.restore();break}case"polygon":case"polyline":{if(!Array.isArray(p.points)||p.points.length<2)break;i.beginPath();const b=p.points[0];i.moveTo(this.toX(b[0]),this.toY(b[1]));for(let g=1;g<p.points.length;g++){const v=p.points[g];i.lineTo(this.toX(v[0]),this.toY(v[1]))}p.op==="polygon"&&(i.closePath(),r&&(i.save(),i.globalAlpha=l,i.fillStyle=o,i.fill(),i.restore())),(n||p.op==="polyline")&&(i.save(),i.globalAlpha=u,i.strokeStyle=c,i.lineWidth=d,i.stroke(),i.restore());break}default:s.push(`Ignored unsupported action in FlatCanvas: ${p.op}`);break}}catch(b){s.push(`Error executing action ${p.op}: ${b.message}`)}i.restore();const m=Math.round(performance.now()-t);let y="";try{y=this.canvas.toDataURL("image/png")}catch(p){s.push(`Canvas export error: ${p.message}`)}return{image:y,canvas:this.canvas,width:this.width,height:this.height,warnings:s,executionTimeMs:m}}async snapshot(){return new Promise(e=>{this.canvas?this.canvas.toBlob(e,"image/png"):e(null)})}}let O=null;async function le(){if(!O&&typeof window<"u")try{O=await H(()=>import("./brush.esm-CMdHLq5g.js"),[])}catch(a){console.warn("Could not load standalone p5.brush:",a)}return O}class ce extends N{constructor(e={}){super("watercolor","Watercolor"),this.width=e.width||400,this.height=e.height||400,this.seed=e.seed||42,this.defaultBleed=.25,this.defaultTexture=.4,this.defaultHatchDistance=0,this.defaultHatchAngle=45,typeof document<"u"&&(this.canvas=document.createElement("canvas"),this.canvas.width=this.width,this.canvas.height=this.height)}capabilities(){return{id:this.id,name:this.name,coordinateSystem:"normalized",range:{x:[-1,1],y:[-1,1]},core:[...I],extensions:[...U]}}reset(e={}){e.width&&(this.width=e.width),e.height&&(this.height=e.height),e.seed!==void 0&&(this.seed=e.seed),this.canvas&&(this.canvas.width=this.width,this.canvas.height=this.height)}toX(e){return e*(this.width*.5)}toY(e){return e*(this.height*.5)}toSize(e){return e*.5*Math.min(this.width,this.height)}async render(e){const t=performance.now(),s=[],i=C(e),r=await le();let n=!1;if(r&&typeof document<"u")try{this.brushCanvas||(this.brushCanvas=r.createCanvas(this.width,this.height)),typeof r.seed=="function"&&r.seed(this.seed),typeof r.noiseSeed=="function"&&r.noiseSeed(this.seed),typeof r.clear=="function"&&r.clear("#faf7f2");let c=this.defaultBleed,u=this.defaultTexture,d=1.5,h="#3a5a78",m=.8,y="#222222",p=!0,b=!1,g=!1,v=10,x=45;typeof r.fillBleed=="function"&&r.fillBleed(c),typeof r.fillTexture=="function"&&r.fillTexture(u),typeof r.noHatch=="function"&&r.noHatch();for(const f of i.actions)switch(f.op){case"background":case"clear":typeof r.clear=="function"&&r.clear(f.color||"#faf7f2");break;case"brush.bleed":c=f.amount??.25,typeof r.fillBleed=="function"&&r.fillBleed(c);break;case"brush.texture":u=f.amount??.4,typeof r.fillTexture=="function"&&r.fillTexture(u);break;case"brush.hatch":g=!0,v=f.distance??10,x=f.angle??45,typeof r.hatch=="function"&&r.hatch(v,x);break;case"brush.weight":case"strokeWidth":d=f.width??1.5,typeof r.strokeWeight=="function"&&r.strokeWeight(d);break;case"fill":p=!0,h=f.color||"#3a5a78",f.opacity!==void 0&&(m=f.opacity),typeof r.fill=="function"&&r.fill(h,m,c,u);break;case"noFill":p=!1,typeof r.noFill=="function"&&r.noFill();break;case"stroke":b=!0,y=f.color||"#222222",f.width!==void 0&&(d=f.width),typeof r.stroke=="function"&&r.stroke(y,d);break;case"noStroke":b=!1,typeof r.noStroke=="function"&&r.noStroke();break;case"circle":{const S=this.toX(f.x),k=this.toY(f.y),M=Math.max(1,this.toSize(f.diameter));typeof r.circle=="function"&&r.circle(S,k,M);break}case"rect":{const S=this.toX(f.x),k=this.toY(f.y),M=this.toSize(f.width),$=this.toSize(f.height);typeof r.rect=="function"&&r.rect(S-M*.5,k-$*.5,M,$);break}case"line":{const S=this.toX(f.x1),k=this.toY(f.y1),M=this.toX(f.x2),$=this.toY(f.y2);typeof r.line=="function"&&r.line(S,k,M,$);break}case"polygon":{if(Array.isArray(f.points)&&f.points.length>=3){const S=f.points.map(k=>[this.toX(k[0]),this.toY(k[1])]);typeof r.polygon=="function"&&r.polygon(S)}break}default:s.push(`Ignored action in Watercolor: ${f.op}`);break}typeof r.render=="function"&&r.render(),this.canvas=this.brushCanvas,n=!0}catch(c){s.push(`p5.brush WebGL render note: ${c.message}. Falling back to watercolor 2D shader.`)}n||(this.renderWatercolor2DFallback(i,s),this.canvas=this.canvas2D);const o=Math.round(performance.now()-t);let l="";try{l=this.canvas?this.canvas.toDataURL("image/png"):""}catch(c){s.push(`Watercolor export error: ${c.message}`)}return{image:l,canvas:this.canvas,width:this.width,height:this.height,warnings:s,executionTimeMs:o}}renderWatercolor2DFallback(e,t){if(!this.canvas2D&&typeof document<"u"&&(this.canvas2D=document.createElement("canvas"),this.canvas2D.width=this.width,this.canvas2D.height=this.height),!this.canvas2D)return;this.canvas2D.width=this.width,this.canvas2D.height=this.height;const s=this.canvas2D.getContext("2d");if(!s)return;const i=this.width,r=this.height;s.fillStyle="#f8f4eb",s.fillRect(0,0,i,r),s.save(),s.fillStyle="rgba(180, 160, 140, 0.05)";for(let h=0;h<600;h++){const m=(Math.sin(this.seed+h*13)+1)*.5*i,y=(Math.cos(this.seed+h*19)+1)*.5*r;s.fillRect(m,y,2,2)}s.restore();let n=!0,o=!1,l="#ce526d",c=.75,u="#333333",d=.25;for(const h of e.actions)switch(h.op){case"background":case"clear":s.fillStyle=h.color||"#f8f4eb",s.fillRect(0,0,i,r);break;case"brush.bleed":d=h.amount??.25;break;case"fill":n=!0,l=h.color||"#ce526d",h.opacity!==void 0&&(c=h.opacity);break;case"noFill":n=!1;break;case"stroke":o=!0,u=h.color||"#333333";break;case"noStroke":o=!1;break;case"circle":{const m=(h.x+1)*.5*i,y=(h.y+1)*.5*r,p=Math.max(1,this.toSize(h.diameter)*.5);if(n)for(let g=0;g<4;g++){s.save(),s.globalAlpha=c/4*1.3,s.fillStyle=l,s.beginPath();const v=24;for(let x=0;x<=v;x++){const f=x/v*Math.PI*2,S=(Math.sin(f*5+g+this.seed)*.12+Math.cos(f*3)*.08)*d,k=p*(1-g*.08+S),M=m+Math.cos(f)*k,$=y+Math.sin(f)*k;x===0?s.moveTo(M,$):s.lineTo(M,$)}s.closePath(),s.fill(),s.restore()}o&&(s.save(),s.strokeStyle=u,s.lineWidth=1.5,s.globalAlpha=.7,s.beginPath(),s.arc(m,y,p,0,Math.PI*2),s.stroke(),s.restore());break}case"rect":{const m=(h.x+1)*.5*i,y=(h.y+1)*.5*r,p=this.toSize(h.width),b=this.toSize(h.height);n&&(s.save(),s.globalAlpha=c,s.fillStyle=l,s.fillRect(m-p*.5,y-b*.5,p,b),s.restore());break}case"polygon":{if(Array.isArray(h.points)&&h.points.length>=3&&n){s.save(),s.globalAlpha=c,s.fillStyle=l,s.beginPath(),s.moveTo((h.points[0][0]+1)*.5*i,(h.points[0][1]+1)*.5*r);for(let m=1;m<h.points.length;m++)s.lineTo((h.points[m][0]+1)*.5*i,(h.points[m][1]+1)*.5*r);s.closePath(),s.fill(),s.restore()}break}case"line":{s.save(),s.strokeStyle=u,s.lineWidth=2,s.beginPath(),s.moveTo((h.x1+1)*.5*i,(h.y1+1)*.5*r),s.lineTo((h.x2+1)*.5*i,(h.y2+1)*.5*r),s.stroke(),s.restore();break}}}async snapshot(){return new Promise(e=>{this.canvas?this.canvas.toBlob(e,"image/png"):e(null)})}}class de extends N{constructor(e={}){super("pixel","Pixel"),this.cols=e.cols||32,this.rows=e.rows||48,this.displayScale=e.displayScale||10,this.palette=[...e.palette||ne],this.mirrorX=!1,this.mirrorY=!1,this.grid=new Array(this.cols*this.rows).fill(null),typeof document<"u"&&(this.canvas=document.createElement("canvas"),this.canvas.width=this.cols*this.displayScale,this.canvas.height=this.rows*this.displayScale,this.ctx=this.canvas.getContext("2d"))}capabilities(){return{id:this.id,name:this.name,coordinateSystem:"pixel",dimensions:{cols:this.cols,rows:this.rows},core:[...X],extensions:[]}}reset(e={}){e.cols&&(this.cols=e.cols),e.rows&&(this.rows=e.rows),e.palette&&(this.palette=[...e.palette]),e.displayScale&&(this.displayScale=e.displayScale),this.mirrorX=!1,this.mirrorY=!1,this.grid=new Array(this.cols*this.rows).fill(null),this.canvas&&(this.canvas.width=this.cols*this.displayScale,this.canvas.height=this.rows*this.displayScale,this.ctx=this.canvas.getContext("2d"))}resolveColor(e){if(e==null)return this.palette[0];if(typeof e=="number"){const t=Math.abs(Math.floor(e))%this.palette.length;return this.palette[t]}return String(e)}setPixel(e,t,s){const i=this.resolveColor(s);this._drawPoint(e,t,i),this.mirrorX&&this._drawPoint(this.cols-1-e,t,i),this.mirrorY&&this._drawPoint(e,this.rows-1-t,i),this.mirrorX&&this.mirrorY&&this._drawPoint(this.cols-1-e,this.rows-1-t,i)}_drawPoint(e,t,s){e<0||e>=this.cols||t<0||t>=this.rows||(this.grid[t*this.cols+e]=s)}drawLine(e,t,s,i,r){let n=e,o=t;const l=Math.abs(s-e),c=Math.abs(i-t),u=e<s?1:-1,d=t<i?1:-1;let h=l-c;for(;this.setPixel(n,o,r),!(n===s&&o===i);){const m=2*h;m>-c&&(h-=c,n+=u),m<l&&(h+=l,o+=d)}}drawHLine(e,t,s,i){const r=Math.max(0,Math.min(t,s)),n=Math.min(this.cols-1,Math.max(t,s));for(let o=r;o<=n;o++)this.setPixel(o,e,i)}drawVLine(e,t,s,i){const r=Math.max(0,Math.min(t,s)),n=Math.min(this.rows-1,Math.max(t,s));for(let o=r;o<=n;o++)this.setPixel(e,o,i)}drawRect(e,t,s,i,r,n=!0){if(n)for(let o=t;o<t+i;o++)for(let l=e;l<e+s;l++)this.setPixel(l,o,r);else this.drawHLine(t,e,e+s-1,r),this.drawHLine(t+i-1,e,e+s-1,r),this.drawVLine(e,t,t+i-1,r),this.drawVLine(e+s-1,t,t+i-1,r)}drawPolygon(e,t){if(!(!e||e.length<3))for(let s=0;s<e.length;s++){const i=e[s],r=e[(s+1)%e.length];this.drawLine(Math.round(i[0]),Math.round(i[1]),Math.round(r[0]),Math.round(r[1]),t)}}async render(e){const t=performance.now(),s=[],i=C(e),r=i.actions.find(l=>l.op==="palette");r&&Array.isArray(r.colors)&&r.colors.length>0&&(this.palette=[...r.colors]),this.mirrorX=!1,this.mirrorY=!1,this.grid.fill(this.palette[0]);for(const l of i.actions)try{switch(l.op){case"background":case"clear":{const c=this.resolveColor(l.color??0);this.grid.fill(c);break}case"palette":Array.isArray(l.colors)&&l.colors.length>0&&(this.palette=[...l.colors]);break;case"mirrorX":this.mirrorX=!!l.enabled;break;case"mirrorY":this.mirrorY=!!l.enabled;break;case"pixel":this.setPixel(l.x,l.y,l.color);break;case"hline":this.drawHLine(l.y,l.x1,l.x2,l.color);break;case"vline":this.drawVLine(l.x,l.y1,l.y2,l.color);break;case"line":this.drawLine(l.x1,l.y1,l.x2,l.y2,l.color);break;case"rect":this.drawRect(l.x,l.y,l.width,l.height,l.color,l.fill!==!1);break;case"polygon":this.drawPolygon(l.points,l.color);break;default:s.push(`Pixel Medium ignored non-pixel action: ${l.op}`);break}}catch(c){s.push(`Pixel render action error ${l.op}: ${c.message}`)}if(!this.canvas&&typeof document<"u"&&(this.canvas=document.createElement("canvas"),this.ctx=this.canvas.getContext("2d")),this.canvas){const l=this.cols*this.displayScale,c=this.rows*this.displayScale;this.canvas.width=l,this.canvas.height=c;const u=this.ctx;u.imageSmoothingEnabled=!1;for(let d=0;d<this.rows;d++)for(let h=0;h<this.cols;h++){const m=this.grid[d*this.cols+h]||this.palette[0];u.fillStyle=m,u.fillRect(h*this.displayScale,d*this.displayScale,this.displayScale,this.displayScale)}}const n=Math.round(performance.now()-t);let o="";try{o=this.canvas.toDataURL("image/png")}catch(l){s.push(`Pixel canvas export error: ${l.message}`)}return{image:o,canvas:this.canvas,width:this.cols*this.displayScale,height:this.rows*this.displayScale,warnings:s,executionTimeMs:n}}async snapshot(){return new Promise(e=>{this.canvas?this.canvas.toBlob(e,"image/png"):e(null)})}}class he{constructor(){this.media=new Map,this.register(new oe),this.register(new ce),this.register(new de)}register(e){if(!e||!e.id)throw new Error('Medium must have an "id" property.');this.media.set(e.id,e)}get(e){return this.media.get(e)}has(e){return this.media.has(e)}list(){return Array.from(this.media.values()).map(e=>({id:e.id,name:e.name,capabilities:e.capabilities()}))}}const ue=new he,W="artist_model_studio_session_v1";class pe{constructor(){this.sessionId="session_"+Date.now(),this.generations=[],this.currentGeneration=0,this.activeCandidateId=null,this.listeners=new Set,this.loadFromStorage()}subscribe(e){return this.listeners.add(e),()=>this.listeners.delete(e)}notify(){this.saveToStorage();for(const e of this.listeners)try{e(this)}catch(t){console.error("Session listener error:",t)}}createCandidate({prompt:e,model:t,modelSettings:s={},medium:i,mediumSettings:r={},program:n,parentId:o=null,generation:l=0,renderMetadata:c={},rawResponse:u=""}){return{id:"cand_"+Math.random().toString(36).slice(2,9),timestamp:Date.now(),prompt:e,model:t,modelSettings:s,medium:i,mediumSettings:r,program:n,parentId:o,generation:l,selected:!1,rating:0,feedback:"",rawResponse:u,renderMetadata:{executionTimeMs:c.executionTimeMs||0,renderTimeMs:c.renderTimeMs||0,actionCount:n.actions?.length||0,warnings:c.warnings||[]}}}addGeneration({prompt:e,candidates:t,parentId:s=null}){const i=this.generations.length,r={generationIndex:i,prompt:e,parentId:s,timestamp:Date.now(),candidates:t};this.generations.push(r),this.currentGeneration=i,t.length>0?this.selectCandidate(t[0].id):this.notify()}getCurrentCandidates(){return this.generations.length===0?[]:this.generations[this.generations.length-1].candidates||[]}getActiveCandidate(){const e=this.getCurrentCandidates();return e.find(t=>t.id===this.activeCandidateId)||e[0]||null}selectCandidate(e){this.activeCandidateId=e;const t=this.getCurrentCandidates();for(const s of t)s.selected=s.id===e;this.notify()}rateCandidate(e,t){const s=this.findCandidate(e);s&&(s.rating=t,this.notify())}setFeedback(e,t){const s=this.findCandidate(e);s&&(s.feedback=t,this.notify())}updateCandidateProgram(e,t){const s=this.findCandidate(e);s&&(s.program=t,s.renderMetadata.actionCount=t.actions?.length||0,s.isEdited=!0,this.notify())}findCandidate(e){for(const t of this.generations)for(const s of t.candidates)if(s.id===e)return s;return null}clearSession(){this.sessionId="session_"+Date.now(),this.generations=[],this.currentGeneration=0,this.activeCandidateId=null,this.notify()}saveToStorage(){if(!(typeof localStorage>"u"))try{const e={sessionId:this.sessionId,generations:this.generations,currentGeneration:this.currentGeneration,activeCandidateId:this.activeCandidateId};localStorage.setItem(W,JSON.stringify(e))}catch(e){console.warn("Could not save session to localStorage:",e)}}loadFromStorage(){if(!(typeof localStorage>"u"))try{const e=localStorage.getItem(W);if(e){const t=JSON.parse(e);this.sessionId=t.sessionId||this.sessionId,this.generations=t.generations||[],this.currentGeneration=t.currentGeneration||0,this.activeCandidateId=t.activeCandidateId||null}}catch(e){console.warn("Could not load session from localStorage:",e)}}}const me=new pe,fe=1,ge="Three Leaning Watercolor Flowers",ye="watercolor",be=[{op:"background",color:"#faf7f2"},{op:"brush.bleed",amount:.35},{op:"brush.texture",amount:.45},{op:"stroke",color:"#2c5432",width:2},{op:"line",x1:-.6,y1:-.1,x2:-.4,y2:.7},{op:"line",x1:-.2,y1:-.2,x2:-.05,y2:.75},{op:"line",x1:.25,y1:-.05,x2:.35,y2:.7},{op:"noStroke"},{op:"fill",color:"#ce526d",opacity:.8},{op:"circle",x:-.6,y:-.1,diameter:.32},{op:"fill",color:"#d9657b",opacity:.85},{op:"circle",x:-.2,y:-.2,diameter:.38},{op:"fill",color:"#e2788c",opacity:.8},{op:"circle",x:.25,y:-.05,diameter:.28},{op:"brush.hatch",distance:8,angle:35},{op:"fill",color:"#f0b441",opacity:.9},{op:"circle",x:-.2,y:-.2,diameter:.12}],ve={version:fe,name:ge,medium:ye,actions:be},we=1,xe="Pixel Rose Sprite",Se="pixel",ke=[{op:"palette",colors:["#16151c","#693a32","#c95267","#e3b86c","#eee4c8"]},{op:"background",color:0},{op:"mirrorX",enabled:!0},{op:"rect",x:12,y:14,width:8,height:8,color:2},{op:"rect",x:14,y:16,width:4,height:4,color:3},{op:"pixel",x:15,y:17,color:4},{op:"vline",x:16,y1:22,y2:38,color:1},{op:"hline",y:28,x1:12,x2:16,color:1},{op:"pixel",x:11,y:27,color:1},{op:"pixel",x:10,y:26,color:1}],Me={version:we,name:xe,medium:Se,actions:ke},Ce=1,$e="Flat Bauhaus Composition",Ae="flat",Te=[{op:"background",color:"#f2eee9"},{op:"fill",color:"#1f2421",opacity:.9},{op:"rect",x:-.4,y:.1,width:.6,height:.4},{op:"fill",color:"#d64045",opacity:.85},{op:"circle",x:.3,y:-.3,diameter:.55},{op:"fill",color:"#467599",opacity:.8},{op:"polygon",points:[[-.2,-.6],[.1,-.1],[-.5,-.1]]},{op:"stroke",color:"#1d1e18",width:3},{op:"line",x1:-.8,y1:.45,x2:.8,y2:.45}],Ne={version:Ce,name:$e,medium:Ae,actions:Te},P=[{id:"watercolor-flowers",name:"Watercolor — Three Leaning Flowers",medium:"watercolor",program:ve},{id:"pixel-rose",name:"Pixel — Rose Sprite (32x48)",medium:"pixel",program:Me},{id:"flat-bauhaus",name:"Flat Canvas — Bauhaus Geometry",medium:"flat",program:Ne}];class Ee{constructor({artists:e=[],media:t=[],activeArtist:s="mock",activeMedium:i="watercolor",activeMode:r="draw",onArtistChange:n,onMediumChange:o,onModeChange:l,onGenerate:c,onLoadExample:u,onOpenSettings:d}){this.artists=e,this.media=t,this.activeArtist=s,this.activeMedium=i,this.activeMode=r,this.onArtistChange=n,this.onMediumChange=o,this.onModeChange=l,this.onGenerate=c,this.onLoadExample=u,this.onOpenSettings=d,this.promptPresets=["three red flowers bending left","solitary blue tree in the wind","sparse geometric Bauhaus sunrise","rose sprite with petals"]}render(e){e.innerHTML=`
      <header class="studio-header">
        <div class="studio-brand">
          <h1>Artist–Model Studio</h1>
          <span class="badge">Lab</span>
        </div>

        <div class="studio-selectors">
          <div class="selector-group">
            <label for="artist-select">Artist:</label>
            <select id="artist-select">
              ${this.artists.map(t=>`<option value="${t.id}" ${t.id===this.activeArtist?"selected":""}>${t.name}</option>`).join("")}
            </select>
          </div>

          <div class="selector-group">
            <label for="medium-select">Medium:</label>
            <select id="medium-select">
              ${this.media.map(t=>`<option value="${t.id}" ${t.id===this.activeMedium?"selected":""}>${t.name}</option>`).join("")}
            </select>
          </div>

          <div class="mode-tabs">
            <button class="tab-btn ${this.activeMode==="draw"?"active":""}" data-mode="draw">STUDIO</button>
            <button class="tab-btn ${this.activeMode==="reward"?"active":""}" data-mode="reward">REWARD LAB</button>
            <button class="tab-btn ${this.activeMode==="datasets"?"active":""}" data-mode="datasets">DATASETS</button>
          </div>

          <button id="settings-btn" class="btn-icon" title="Settings & Hardware">⚙ Settings</button>
        </div>
      </header>

      <div class="prompt-container">
        <div class="prompt-row">
          <input
            id="studio-prompt-input"
            class="prompt-input"
            type="text"
            placeholder="Describe what to draw... (e.g. three red flowers bending left)"
            value="three red flowers bending left"
          />
          <button id="generate-btn" class="btn-primary">
            <span>✦ Generate 4</span>
          </button>
        </div>

        <div class="preset-pills">
          <span>Presets:</span>
          ${this.promptPresets.map(t=>`<button class="pill-btn preset-pill" data-prompt="${t}">${t}</button>`).join("")}
          <span style="margin-left: 12px;">Examples:</span>
          ${P.map(t=>`<button class="pill-btn example-pill" data-example="${t.id}">${t.name.split("—")[0]}</button>`).join("")}
        </div>
      </div>
    `,this.attachEvents(e)}attachEvents(e){e.querySelector("#artist-select")?.addEventListener("change",c=>{this.activeArtist=c.target.value,this.onArtistChange&&this.onArtistChange(this.activeArtist)}),e.querySelector("#medium-select")?.addEventListener("change",c=>{this.activeMedium=c.target.value,this.onMediumChange&&this.onMediumChange(this.activeMedium)});const i=e.querySelectorAll(".tab-btn");i.forEach(c=>{c.addEventListener("click",()=>{i.forEach(u=>u.classList.remove("active")),c.classList.add("active"),this.activeMode=c.dataset.mode,this.onModeChange&&this.onModeChange(this.activeMode)})});const r=e.querySelector("#studio-prompt-input");e.querySelector("#generate-btn")?.addEventListener("click",()=>{const c=r?.value?.trim()||"three red flowers";this.onGenerate&&this.onGenerate(c)}),r?.addEventListener("keydown",c=>{if(c.key==="Enter"){const u=r?.value?.trim()||"three red flowers";this.onGenerate&&this.onGenerate(u)}}),e.querySelectorAll(".preset-pill").forEach(c=>{c.addEventListener("click",()=>{r&&(r.value=c.dataset.prompt)})}),e.querySelectorAll(".example-pill").forEach(c=>{c.addEventListener("click",()=>{const u=P.find(d=>d.id===c.dataset.example);u&&this.onLoadExample&&this.onLoadExample(u)})}),e.querySelector("#settings-btn")?.addEventListener("click",()=>{this.onOpenSettings&&this.onOpenSettings()})}setGenerating(e){const t=document.querySelector("#generate-btn");t&&(t.disabled=e,t.innerHTML=e?"<span>⏳ Generating...</span>":"<span>✦ Generate 4</span>")}}class Pe{constructor(){this.metrics={model:"None",medium:"Watercolor",generationTimeMs:0,renderTimeMs:0,actionCount:0,totalTimeMs:0,generationIndex:0}}update(e){Object.assign(this.metrics,e),this.metrics.totalTimeMs=(this.metrics.generationTimeMs||0)+(this.metrics.renderTimeMs||0),this.render()}render(e=null){const t=e||document.querySelector("#status-banner-container");t&&(t.innerHTML=`
      <div class="status-bar">
        <div class="status-group">
          <span class="metric">MODEL: <strong>${this.metrics.model}</strong></span>
          <span style="margin: 0 8px; color: var(--border-color);">|</span>
          <span class="metric">MEDIUM: <strong>${this.metrics.medium}</strong></span>
          <span style="margin: 0 8px; color: var(--border-color);">|</span>
          <span class="metric">GEN: <strong>${this.metrics.generationIndex}</strong></span>
        </div>
        <div class="status-group">
          <span class="metric">GENERATION: <strong>${this.metrics.generationTimeMs} ms</strong></span>
          <span style="margin: 0 8px; color: var(--border-color);">|</span>
          <span class="metric">PROGRAM: <strong>${this.metrics.actionCount} actions</strong></span>
          <span style="margin: 0 8px; color: var(--border-color);">|</span>
          <span class="metric">RENDER: <strong>${this.metrics.renderTimeMs} ms</strong></span>
          <span style="margin: 0 8px; color: var(--border-color);">|</span>
          <span class="metric">TOTAL: <strong>${this.metrics.totalTimeMs} ms</strong></span>
        </div>
      </div>
    `)}}class Re{constructor({onSelectCandidate:e,onVariations:t,onContinue:s,onCritique:i,onCompareMedia:r,onStartOver:n,onRate:o}){this.candidates=[],this.selectedId=null,this.onSelectCandidate=e,this.onVariations=t,this.onContinue=s,this.onCritique=i,this.onCompareMedia=r,this.onStartOver=n,this.onRate=o}update(e,t=null){this.candidates=e||[],this.selectedId=t||(this.candidates[0]?.id??null),this.render()}render(e=null){const t=e||document.querySelector("#candidate-grid-container");if(!t)return;if(this.candidates.length===0){t.innerHTML=`
        <div class="candidate-grid-section">
          <div style="padding: 40px; text-align: center; color: var(--text-muted); background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
            <h3>No candidates generated yet.</h3>
            <p style="margin-top: 8px; font-size: 0.88rem;">Click <strong>Generate 4</strong> or pick an example above to begin.</p>
          </div>
        </div>
      `;return}const s=["A","B","C","D","E","F","G","H"];t.innerHTML=`
      <div class="candidate-grid-section">
        <div class="candidates-grid">
          ${this.candidates.map((i,r)=>{const n=s[r]||String(r+1),o=i.id===this.selectedId||i.selected;return`
                <div class="candidate-card ${o?"selected":""}" data-id="${i.id}">
                  <div class="candidate-header">
                    <span class="candidate-badge">${n}</span>
                    <span style="font-size: 0.8rem; color: ${o?"var(--accent-color)":"var(--text-muted)"};">
                      ${o?"● Selected":"○"}
                    </span>
                  </div>
                  <div class="candidate-canvas-wrap" id="canvas-wrap-${i.id}">
                    ${i.renderedImage?`<img src="${i.renderedImage}" alt="Candidate ${n}" />`:'<div style="padding: 20px; color: #999; font-size: 0.8rem;">Rendering...</div>'}
                  </div>
                  <div class="candidate-footer">
                    <span>${i.renderMetadata?.actionCount||i.program?.actions?.length||0} ops · ${i.renderMetadata?.renderTimeMs||0}ms</span>
                    <div class="rating-stars" data-id="${i.id}">
                      ${[1,2,3,4,5].map(l=>`<span class="star ${(i.rating||0)>=l?"filled":""}" data-star="${l}">★</span>`).join("")}
                    </div>
                  </div>
                </div>
              `}).join("")}
        </div>

        <div class="action-toolbar">
          <button id="variations-btn" class="btn-secondary" ${this.selectedId?"":"disabled"}>
            ✦ Variations (Breed)
          </button>
          <button id="continue-btn" class="btn-secondary" ${this.selectedId?"":"disabled"}>
            ➔ Continue
          </button>
          <button id="critique-btn" class="btn-secondary" ${this.selectedId?"":"disabled"}>
            💬 Critique
          </button>
          <button id="compare-media-btn" class="btn-secondary" ${this.selectedId?"":"disabled"}>
            ⚖ Compare Media (Ablation)
          </button>
          <button id="start-over-btn" class="btn-secondary" style="margin-left: auto; color: var(--text-muted);">
            ↺ Start Over
          </button>
        </div>
      </div>
    `,this.attachEvents(t)}attachEvents(e){e.querySelectorAll(".candidate-card").forEach(i=>{i.addEventListener("click",r=>{if(r.target.classList.contains("star"))return;const n=i.dataset.id;this.selectedId=n,this.onSelectCandidate&&this.onSelectCandidate(n)})}),e.querySelectorAll(".star").forEach(i=>{i.addEventListener("click",r=>{r.stopPropagation();const n=i.parentElement.dataset.id,o=Number(i.dataset.star);this.onRate&&this.onRate(n,o)})}),e.querySelector("#variations-btn")?.addEventListener("click",()=>{this.selectedId&&this.onVariations&&this.onVariations(this.selectedId)}),e.querySelector("#continue-btn")?.addEventListener("click",()=>{this.selectedId&&this.onContinue&&this.onContinue(this.selectedId)}),e.querySelector("#critique-btn")?.addEventListener("click",()=>{this.selectedId&&this.onCritique&&this.onCritique(this.selectedId)}),e.querySelector("#compare-media-btn")?.addEventListener("click",()=>{this.selectedId&&this.onCompareMedia&&this.onCompareMedia(this.selectedId)}),e.querySelector("#start-over-btn")?.addEventListener("click",()=>{this.onStartOver&&this.onStartOver()})}}function z(a){if(!a||!Array.isArray(a.actions))return"";const e=[];for(const t of a.actions)if(!(!t||!t.op))switch(t.op){case"background":e.push(`background ${t.color||"#ffffff"}`);break;case"clear":e.push(t.color?`clear ${t.color}`:"clear");break;case"fill":t.opacity!==void 0&&t.opacity!==1?e.push(`fill ${t.color||"#000000"} ${t.opacity}`):e.push(`fill ${t.color||"#000000"}`);break;case"noFill":e.push("noFill");break;case"stroke":t.width!==void 0?e.push(`stroke ${t.color||"#000000"} ${t.width}`):e.push(`stroke ${t.color||"#000000"}`);break;case"noStroke":e.push("noStroke");break;case"strokeWidth":e.push(`strokeWidth ${t.width??1}`);break;case"circle":e.push(`circle ${w(t.x)} ${w(t.y)} ${w(t.diameter)}`);break;case"rect":e.push(`rect ${w(t.x)} ${w(t.y)} ${w(t.width)} ${w(t.height)}${t.color?" "+t.color:""}`);break;case"line":e.push(`line ${w(t.x1)} ${w(t.y1)} ${w(t.x2)} ${w(t.y2)}`);break;case"polygon":if(Array.isArray(t.points)){const s=t.points.map(i=>`${w(i[0])},${w(i[1])}`).join(" ");e.push(`polygon ${s}`)}break;case"polyline":if(Array.isArray(t.points)){const s=t.points.map(i=>`${w(i[0])},${w(i[1])}`).join(" ");e.push(`polyline ${s}`)}break;case"brush.bleed":e.push(`bleed ${w(t.amount??.25)}`);break;case"brush.texture":e.push(`texture ${w(t.amount??.5)}`);break;case"brush.hatch":e.push(`hatch ${w(t.distance??10)} ${w(t.angle??45)}`);break;case"brush.weight":e.push(`brush.weight ${w(t.width??2)}`);break;case"pixel":e.push(`pixel ${Math.round(t.x??0)} ${Math.round(t.y??0)} ${t.color??0}`);break;case"hline":e.push(`hline ${Math.round(t.y??0)} ${Math.round(t.x1??0)} ${Math.round(t.x2??0)} ${t.color??0}`);break;case"vline":e.push(`vline ${Math.round(t.x??0)} ${Math.round(t.y1??0)} ${Math.round(t.y2??0)} ${t.color??0}`);break;case"palette":Array.isArray(t.colors)&&e.push(`palette ${t.colors.join(" ")}`);break;case"mirrorX":e.push(`mirrorX ${t.enabled?"on":"off"}`);break;case"mirrorY":e.push(`mirrorY ${t.enabled?"on":"off"}`);break;default:e.push(`${t.op} ${JSON.stringify(t)}`);break}return e.join(`
`)}function B(a){if(!a||typeof a!="string")return{version:1,actions:[]};const e=a.split(`
`),t=[];for(let s of e){let i=s.trim();if((!i||i.startsWith("//")||i.startsWith("#")&&!i.startsWith("#background")&&!i.startsWith("#fill"))&&i.startsWith("#")&&!i.includes(" "))continue;const r=i.split(/\s+/).filter(Boolean);if(r.length===0)continue;const n=r[0].toLowerCase();switch(n){case"background":t.push({op:"background",color:r[1]||"#ffffff"});break;case"clear":t.push({op:"clear",color:r[1]});break;case"fill":{const o={op:"fill",color:r[1]||"#000000"};r[2]!==void 0&&(o.opacity=Number(r[2])),t.push(o);break}case"nofill":t.push({op:"noFill"});break;case"stroke":{const o={op:"stroke",color:r[1]||"#000000"};r[2]!==void 0&&(o.width=Number(r[2])),t.push(o);break}case"nostroke":t.push({op:"noStroke"});break;case"strokewidth":t.push({op:"strokeWidth",width:Number(r[1]||1)});break;case"circle":t.push({op:"circle",x:Number(r[1]||0),y:Number(r[2]||0),diameter:Number(r[3]||.2)});break;case"rect":t.push({op:"rect",x:Number(r[1]||0),y:Number(r[2]||0),width:Number(r[3]||.2),height:Number(r[4]||.2),color:r[5]});break;case"line":t.push({op:"line",x1:Number(r[1]||0),y1:Number(r[2]||0),x2:Number(r[3]||0),y2:Number(r[4]||0)});break;case"polygon":case"polyline":{const o=[];for(let l=1;l<r.length;l++){const c=r[l].split(",");c.length===2&&o.push([Number(c[0]),Number(c[1])])}t.push({op:n,points:o});break}case"bleed":case"brush.bleed":t.push({op:"brush.bleed",amount:Number(r[1]||.25)});break;case"texture":case"brush.texture":t.push({op:"brush.texture",amount:Number(r[1]||.5)});break;case"hatch":case"brush.hatch":t.push({op:"brush.hatch",distance:Number(r[1]||10),angle:Number(r[2]||45)});break;case"brush.weight":t.push({op:"brush.weight",width:Number(r[1]||2)});break;case"pixel":t.push({op:"pixel",x:Number(r[1]||0),y:Number(r[2]||0),color:isNaN(r[3])?r[3]:Number(r[3])});break;case"hline":t.push({op:"hline",y:Number(r[1]||0),x1:Number(r[2]||0),x2:Number(r[3]||0),color:isNaN(r[4])?r[4]:Number(r[4])});break;case"vline":t.push({op:"vline",x:Number(r[1]||0),y1:Number(r[2]||0),y2:Number(r[3]||0),color:isNaN(r[4])?r[4]:Number(r[4])});break;case"palette":t.push({op:"palette",colors:r.slice(1)});break;case"mirrorx":t.push({op:"mirrorX",enabled:r[1]!=="off"});break;case"mirrory":t.push({op:"mirrorY",enabled:r[1]!=="off"});break;default:if(i.startsWith("{"))try{const o=JSON.parse(i);t.push(o)}catch{}break}}return{version:1,actions:t}}function w(a){if(a==null||isNaN(a))return"0";const e=Number(a);return Number.isInteger(e)?String(e):String(Math.round(e*1e3)/1e3)}class Oe{constructor({onProgramChange:e,onRenderWithOtherMedium:t}){this.candidate=null,this.activeTab="text",this.currentText="",this.currentJson="",this.validation={valid:!0,errors:[],warnings:[]},this.onProgramChange=e,this.onRenderWithOtherMedium=t}update(e,t=null){this.candidate=e,this.mediumCapabilities=t,e?.program?(this.currentText=z(e.program),this.currentJson=JSON.stringify(e.program,null,2),this.validation=E(e.program,t)):(this.currentText="",this.currentJson="",this.validation={valid:!0,errors:[],warnings:[]}),this.render()}render(e=null){const t=e||document.querySelector("#program-editor-container");if(t){if(!this.candidate){t.innerHTML=`
        <div class="program-editor-panel" style="display: flex; align-items: center; justify-content: center; color: var(--text-muted);">
          <p style="font-size: 0.85rem;">Select a candidate to view & edit its drawing program.</p>
        </div>
      `;return}t.innerHTML=`
      <div class="program-editor-panel">
        <div class="editor-header">
          <div class="editor-tabs">
            <button class="editor-tab-btn ${this.activeTab==="text"?"active":""}" data-tab="text">Text DSL</button>
            <button class="editor-tab-btn ${this.activeTab==="json"?"active":""}" data-tab="json">JSON</button>
          </div>
          <button id="editor-rerender-btn" class="btn-primary" style="padding: 4px 10px; font-size: 0.78rem;">
            ▶ Re-render
          </button>
        </div>

        <textarea
          id="editor-textarea"
          class="editor-textarea"
          spellcheck="false"
          placeholder="Program code..."
        >${this.activeTab==="text"?this.currentText:this.currentJson}</textarea>

        <div class="editor-footer">
          <div class="validation-tag ${this.validation.valid?"valid":"error"}">
            <span>${this.validation.valid?"● Valid program":"▲ Syntax error"}</span>
            ${this.validation.errors.length>0?`<span style="font-size: 0.72rem;">(${this.validation.errors[0]})</span>`:""}
          </div>
          <button id="editor-swap-medium-btn" class="pill-btn" style="color: var(--text-secondary);">
            ⇄ Render in another medium
          </button>
        </div>
      </div>
    `,this.attachEvents(t)}}attachEvents(e){const t=e.querySelectorAll(".editor-tab-btn"),s=e.querySelector("#editor-textarea");t.forEach(i=>{i.addEventListener("click",()=>{const r=i.dataset.tab;r!==this.activeTab&&(this.syncFromTextarea(s.value),this.activeTab=r,t.forEach(n=>n.classList.remove("active")),i.classList.add("active"),s.value=this.activeTab==="text"?this.currentText:this.currentJson)})}),e.querySelector("#editor-rerender-btn")?.addEventListener("click",()=>{this.handleRerender(s.value)}),e.querySelector("#editor-swap-medium-btn")?.addEventListener("click",()=>{this.syncFromTextarea(s.value),this.candidate&&this.onRenderWithOtherMedium&&this.onRenderWithOtherMedium(this.candidate)}),s?.addEventListener("keydown",i=>{(i.metaKey||i.ctrlKey)&&i.key==="Enter"&&(i.preventDefault(),this.handleRerender(s.value))})}syncFromTextarea(e){if(this.activeTab==="text"){this.currentText=e;const t=B(e);this.currentJson=JSON.stringify(t,null,2)}else{this.currentJson=e;try{const t=C(JSON.parse(e));this.currentText=z(t)}catch{}}}handleRerender(e){this.syncFromTextarea(e);let t;if(this.activeTab==="text")t=B(e);else try{t=C(JSON.parse(e))}catch(s){alert("Invalid JSON: "+s.message);return}this.validation=E(t,this.mediumCapabilities),this.candidate&&this.onProgramChange&&this.onProgramChange(this.candidate.id,t)}}class Le{constructor({flatMedium:e,watercolorMedium:t}){this.flatMedium=e,this.watercolorMedium=t,this.candidate=null}async open(e){this.candidate=e;const t=document.createElement("div");t.className="modal-backdrop",t.id="compare-modal-backdrop",t.innerHTML=`
      <div class="modal-content" style="max-width: 820px;">
        <div class="modal-header">
          <div>
            <h2 style="font-size: 1.1rem; color: var(--text-primary);">COMPARE MEDIA (Renderer Ablation)</h2>
            <p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">
              Same prompt · Same model · Same program geometry
            </p>
          </div>
          <button class="btn-icon" id="close-compare-modal">✕</button>
        </div>

        <div class="modal-body">
          <div style="background: rgba(224, 93, 118, 0.08); border-left: 3px solid var(--accent-color); padding: 10px 14px; font-size: 0.84rem; color: var(--text-primary); border-radius: 4px;">
            <strong>Classroom Core Question:</strong> How much of the perceived artistic character comes from the model, and how much comes from the medium?
          </div>

          <div class="compare-container">
            <div class="compare-card">
              <h3>Flat Canvas (Baseline 2D)</h3>
              <div class="compare-canvas-box" id="flat-canvas-box">
                <div style="padding: 40px; text-align: center; color: #888;">Rendering...</div>
              </div>
              <span style="font-size: 0.72rem; color: var(--text-muted);">Deterministic, geometric, zero shader embellishment.</span>
            </div>

            <div class="compare-card">
              <h3>Watercolor (p5.brush / Washes)</h3>
              <div class="compare-canvas-box" id="watercolor-canvas-box">
                <div style="padding: 40px; text-align: center; color: #888;">Rendering...</div>
              </div>
              <span style="font-size: 0.72rem; color: var(--text-muted);">Pigment bleed, paper grain texture, organic washes.</span>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-secondary" id="done-compare-modal">Close</button>
        </div>
      </div>
    `,document.body.appendChild(t);const s=()=>{t.remove()};t.querySelector("#close-compare-modal")?.addEventListener("click",s),t.querySelector("#done-compare-modal")?.addEventListener("click",s),t.addEventListener("click",i=>{i.target===t&&s()});try{const i=await this.flatMedium.render(e.program),r=t.querySelector("#flat-canvas-box");r&&i.image&&(r.innerHTML=`<img src="${i.image}" alt="Flat Canvas" />`);const n=await this.watercolorMedium.render(e.program),o=t.querySelector("#watercolor-canvas-box");o&&n.image&&(o.innerHTML=`<img src="${n.image}" alt="Watercolor" />`)}catch(i){console.error("Error rendering compare modal:",i)}}}function Ie(a,e){return E(a,e).valid?!a.actions||a.actions.length===0?.2:1:0}function Fe(a){if(!a?.actions?.length)return{redness:0,blueness:0,greenness:0,colorCount:0};let e=0,t=0,s=0,i=0;const r=new Set;for(const n of a.actions)if(n.color&&typeof n.color=="string"){const o=n.color.replace("#","");if(o.length===6){const l=parseInt(o.slice(0,2),16)/255,c=parseInt(o.slice(2,4),16)/255,u=parseInt(o.slice(4,6),16)/255,d=Math.max(0,l-(c+u)*.5),h=Math.max(0,u-(l+c)*.5),m=Math.max(0,c-(l+u)*.5);e+=(l>.5?l:0)+d,t+=(u>.5?u:0)+h,s+=(c>.5?c:0)+m,i++,r.add(n.color.toLowerCase())}}return i===0?{redness:0,blueness:0,greenness:0,colorCount:0}:{redness:Math.min(1,Number((e/i).toFixed(3))),blueness:Math.min(1,Number((t/i).toFixed(3))),greenness:Math.min(1,Number((s/i).toFixed(3))),colorCount:r.size}}function We(a,e=3){if(!a?.actions?.length)return{leftness:.5,centeredness:0,symmetry:1,shapeCountScore:0,shapeCount:0,emptySpace:1};const t=new Set(["circle","rect","line","polygon","polyline","pixel"]);let s=0,i=0,r=0,n=0,o=0;for(const g of a.actions)if(t.has(g.op)){i++;let v=0,x=.05;if(g.op==="circle"){v=g.x??0;const f=(g.diameter??.2)*.5;x=Math.PI*f*f}else g.op==="rect"?(v=g.x??0,x=(g.width??.2)*(g.height??.2)):g.op==="line"?(v=((g.x1??0)+(g.x2??0))*.5,x=.02):g.op==="polygon"&&Array.isArray(g.points)&&(v=g.points.reduce((f,S)=>f+(S[0]||0),0)/Math.max(1,g.points.length),x=.08);s+=v,r+=x,v<-.05?n++:v>.05&&o++}if(i===0)return{leftness:.5,centeredness:0,symmetry:1,shapeCountScore:0,shapeCount:0,emptySpace:1};const l=s/i,c=Math.max(0,Math.min(1,Number(((-l+1)*.5).toFixed(3)))),u=Math.max(0,Math.min(1,Number((1-Math.abs(l)).toFixed(3)))),d=Math.abs(n-o),h=Number((1-d/i).toFixed(3)),m=Math.abs(i-e),y=Math.max(0,Number((1-m*.25).toFixed(3))),p=Math.min(1,r/4),b=Number((1-p).toFixed(3));return{leftness:c,centeredness:u,symmetry:h,shapeCountScore:y,shapeCount:i,emptySpace:b}}const Y={valid:.2,redness:.2,leftness:.2,shapeCount:.2,emptySpace:.2};function V(a,e={}){const t={...Y,...e.weights||{}},s=e.targetShapes??3,i=e.capabilities||null,r=Ie(a,i),n=Fe(a),o=We(a,s),l={valid:r,redness:n.redness,leftness:o.leftness,shapeCount:o.shapeCountScore,emptySpace:o.emptySpace,details:{blueness:n.blueness,greenness:n.greenness,actualShapes:o.shapeCount,centeredness:o.centeredness,symmetry:o.symmetry}},c=t.valid+t.redness+t.leftness+t.shapeCount+t.emptySpace,u=(l.valid*t.valid+l.redness*t.redness+l.leftness*t.leftness+l.shapeCount*t.shapeCount+l.emptySpace*t.emptySpace)/(c||1);return{total:Number(u.toFixed(3)),breakdown:l,weights:t}}class G{constructor(e={}){this.targetShapes=e.targetShapes??3,this.weights=e.weights||null,this.policy={x:-.1,y:0,diameter:.3,red:.8,count:3},this.history=[],this.learningRate=e.learningRate||.15}sampleAction(e,t=.1){return{x:Math.max(-.95,Math.min(.95,e.x+(Math.random()-.5)*t*2)),y:Math.max(-.95,Math.min(.95,e.y+(Math.random()-.5)*t*2)),diameter:Math.max(.01,Math.min(.8,e.diameter+(Math.random()-.5)*t)),red:Math.max(.2,Math.min(1,e.red+(Math.random()-.5)*t)),count:e.count}}actionToProgram(e){const s=`#${Math.floor(e.red*255).toString(16).padStart(2,"0")}2040`,i=[{op:"background",color:"#ffffff"}];for(let r=0;r<e.count;r++){const n=e.x+(r-1)*(e.diameter*1.2);i.push({op:"fill",color:s,opacity:.9}),i.push({op:"circle",x:Number(n.toFixed(3)),y:Number(e.y.toFixed(3)),diameter:Number(e.diameter.toFixed(3))})}return{version:1,actions:i}}step(e=6){const t=[];for(let d=0;d<e;d++){const h=this.sampleAction(this.policy,.15),m=this.actionToProgram(h),y=V(m,{weights:this.weights,targetShapes:this.targetShapes});t.push({action:h,program:m,reward:y.total,breakdown:y.breakdown})}t.sort((d,h)=>h.reward-d.reward);const s=t[0],i=t.reduce((d,h)=>d+h.reward,0)/t.length,r=t.slice(0,Math.ceil(e*.5)),n=r.reduce((d,h)=>d+h.action.x,0)/r.length,o=r.reduce((d,h)=>d+h.action.y,0)/r.length,l=r.reduce((d,h)=>d+h.action.diameter,0)/r.length,c=r.reduce((d,h)=>d+h.action.red,0)/r.length;this.policy.x+=(n-this.policy.x)*this.learningRate,this.policy.y+=(o-this.policy.y)*this.learningRate,this.policy.diameter+=(l-this.policy.diameter)*this.learningRate,this.policy.red+=(c-this.policy.red)*this.learningRate;const u={step:this.history.length+1,meanReward:Number(i.toFixed(3)),bestReward:s.reward,bestBreakdown:s.breakdown,bestProgram:s.program,policySnapshot:{...this.policy}};return this.history.push(u),u}runEpisodes(e=8){const t=[];for(let s=0;s<e;s++)t.push(this.step());return t}}class ze{constructor({onApplyOptimizedProgram:e}){this.weights={...Y},this.targetShapes=3,this.currentCandidate=null,this.optimizer=new G({targetShapes:this.targetShapes,weights:this.weights}),this.trainingHistory=[],this.onApplyOptimizedProgram=e}update(e){this.currentCandidate=e,this.render()}render(e=null){const t=e||document.querySelector("#reward-lab-container");if(!t)return;const s=this.currentCandidate?.program?V(this.currentCandidate.program,{weights:this.weights,targetShapes:this.targetShapes}):null;t.innerHTML=`
      <div class="reward-lab-container">
        <div style="display: flex; justify-content: space-between; align-items: baseline;">
          <h2 style="font-size: 1.1rem; color: var(--text-primary);">DETERMINISTIC REWARD LABORATORY</h2>
          <span style="font-size: 0.8rem; color: var(--text-muted);">Sections 22–24: Policy Search & Reward Hacking</span>
        </div>

        <div class="reward-sliders">
          <div class="slider-group">
            <label><span>Validity</span> <strong id="val-valid">${this.weights.valid}</strong></label>
            <input type="range" class="weight-slider" data-term="valid" min="0" max="1" step="0.05" value="${this.weights.valid}" />
          </div>

          <div class="slider-group">
            <label><span>Redness</span> <strong id="val-redness">${this.weights.redness}</strong></label>
            <input type="range" class="weight-slider" data-term="redness" min="0" max="1" step="0.05" value="${this.weights.redness}" />
          </div>

          <div class="slider-group">
            <label><span>Leftness</span> <strong id="val-leftness">${this.weights.leftness}</strong></label>
            <input type="range" class="weight-slider" data-term="leftness" min="0" max="1" step="0.05" value="${this.weights.leftness}" />
          </div>

          <div class="slider-group">
            <label><span>Shape Count (3)</span> <strong id="val-shapeCount">${this.weights.shapeCount}</strong></label>
            <input type="range" class="weight-slider" data-term="shapeCount" min="0" max="1" step="0.05" value="${this.weights.shapeCount}" />
          </div>

          <div class="slider-group">
            <label><span>Empty Space</span> <strong id="val-emptySpace">${this.weights.emptySpace}</strong></label>
            <input type="range" class="weight-slider" data-term="emptySpace" min="0" max="1" step="0.05" value="${this.weights.emptySpace}" />
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <div class="reward-breakdown-card">
            <h3 style="font-size: 0.95rem; display: flex; justify-content: space-between;">
              <span>Current Candidate Score</span>
              <strong style="color: var(--accent-success); font-size: 1.1rem;">
                ${s?s.total:"—"}
              </strong>
            </h3>

            ${s?`
                <div class="reward-term-row"><span>valid</span> <strong>${s.breakdown.valid.toFixed(2)}</strong></div>
                <div class="reward-term-row"><span>redness</span> <strong>${s.breakdown.redness.toFixed(2)}</strong></div>
                <div class="reward-term-row"><span>leftness</span> <strong>${s.breakdown.leftness.toFixed(2)}</strong></div>
                <div class="reward-term-row"><span>3 shapes target</span> <strong>${s.breakdown.shapeCount.toFixed(2)}</strong></div>
                <div class="reward-term-row"><span>empty space</span> <strong>${s.breakdown.emptySpace.toFixed(2)}</strong></div>
              `:'<p style="color: var(--text-muted); font-size: 0.85rem;">Select or generate a candidate to calculate reward metrics.</p>'}
          </div>

          <div class="reward-breakdown-card">
            <h3 style="font-size: 0.95rem;">Fast Classroom RL</h3>
            <p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px;">
              Train a tiny policy to optimize drawing parameters (position, scale, color) against the specified reward.
            </p>

            <div style="display: flex; gap: 8px; margin-top: 10px;">
              <button id="run-rl-step-btn" class="btn-primary" style="padding: 8px 14px; font-size: 0.85rem;">
                ▶ Run 5 Episodes
              </button>
              <button id="run-rl-hack-btn" class="btn-secondary" style="font-size: 0.85rem;" title="Showcase reward hacking">
                ⚡ Reward-Hack Demo
              </button>
            </div>

            <div id="rl-history-log" style="margin-top: 12px; font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted); max-height: 150px; overflow-y: auto;">
              ${this.trainingHistory.length>0?this.trainingHistory.slice(-6).map(i=>`<div>Step ${i.step}: Mean Reward: <span style="color: var(--accent-success)">${i.meanReward}</span> (Best: ${i.bestReward})</div>`).join(""):'No episodes run yet. Click "Run 5 Episodes" to start training.'}
            </div>
          </div>
        </div>
      </div>
    `,this.attachEvents(t)}attachEvents(e){e.querySelectorAll(".weight-slider").forEach(s=>{s.addEventListener("input",i=>{const r=i.target.dataset.term,n=Number(i.target.value);this.weights[r]=n;const o=e.querySelector(`#val-${r}`);o&&(o.textContent=n.toFixed(2)),this.optimizer.weights=this.weights,this.render(e)})}),e.querySelector("#run-rl-step-btn")?.addEventListener("click",()=>{const s=this.optimizer.runEpisodes(5);this.trainingHistory.push(...s);const i=s[s.length-1];i&&this.onApplyOptimizedProgram&&this.onApplyOptimizedProgram(i.bestProgram),this.render(e)}),e.querySelector("#run-rl-hack-btn")?.addEventListener("click",()=>{this.weights={valid:.1,redness:.3,leftness:.1,shapeCount:.2,emptySpace:.3},this.optimizer=new G({targetShapes:3,weights:this.weights,learningRate:.35});const s=this.optimizer.runEpisodes(8);this.trainingHistory.push(...s);const i=s[s.length-1];i&&this.onApplyOptimizedProgram&&this.onApplyOptimizedProgram(i.bestProgram),this.render(e)})}}function j(a){const e={sessionId:a.sessionId,exportedAt:new Date().toISOString(),totalGenerations:a.generations.length,generations:a.generations};return JSON.stringify(e,null,2)}function D(a,e="selected"){const t=[];for(const s of a.generations)for(const i of s.candidates){let r=!1;if((e==="selected"&&i.selected||e==="rated"&&(i.rating||0)>0||e==="edited"&&i.isEdited||e==="all")&&(r=!0),r&&i.program?.actions?.length>0){const n={messages:[{role:"user",content:i.prompt},{role:"assistant",content:JSON.stringify(i.program)}],metadata:{candidateId:i.id,medium:i.medium,model:i.model,rating:i.rating||0,isEdited:!!i.isEdited,sessionId:a.sessionId}};t.push(JSON.stringify(n))}}return t.join(`
`)}function q(a){const e=[];for(const t of a.generations){const s=t.candidates||[],i=s.find(n=>n.selected);if(!i)continue;const r=s.filter(n=>n.id!==i.id);for(const n of r){const o={prompt:t.prompt,chosen:JSON.stringify(i.program),rejected:JSON.stringify(n.program),metadata:{chosenId:i.id,rejectedId:n.id,medium:i.medium,generation:t.generationIndex,sessionId:a.sessionId}};e.push(JSON.stringify(o))}}return e.join(`
`)}function L(a,e,t="application/json"){if(typeof document>"u")return;const s=new Blob([a],{type:t}),i=URL.createObjectURL(s),r=document.createElement("a");r.href=i,r.download=e,document.body.appendChild(r),r.click(),document.body.removeChild(r),URL.revokeObjectURL(i)}class Be{constructor({sessionStore:e}){this.sessionStore=e,this.activeType="sft"}open(){const e=document.createElement("div");e.className="modal-backdrop",e.id="dataset-modal-backdrop";const t=()=>{let s="";this.activeType==="sft"?s=D(this.sessionStore,"all")||"// No selected candidates yet. Generate and select candidates to produce SFT samples.":this.activeType==="preference"?s=q(this.sessionStore)||"// No preference pairs yet. Select winning candidates from generations to produce chosen > rejected pairs.":s=j(this.sessionStore),e.innerHTML=`
        <div class="modal-content" style="max-width: 760px;">
          <div class="modal-header">
            <div>
              <h2 style="font-size: 1.1rem; color: var(--text-primary);">DATASET COLLECTION & EXPORT</h2>
              <p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">
                Sections 17–19: Export training data for SFT, LoRA, and DPO Preference learning
              </p>
            </div>
            <button class="btn-icon" id="close-dataset-modal">✕</button>
          </div>

          <div class="modal-body">
            <div style="display: flex; gap: 8px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
              <button class="btn-secondary ${this.activeType==="sft"?"active":""}" id="tab-sft">
                SFT Dataset (.jsonl)
              </button>
              <button class="btn-secondary ${this.activeType==="preference"?"active":""}" id="tab-pref">
                Preference Dataset (.jsonl)
              </button>
              <button class="btn-secondary ${this.activeType==="session"?"active":""}" id="tab-session">
                Full Session (.json)
              </button>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 0.82rem; color: var(--text-secondary);">
                ${this.activeType==="sft"?'Standard chat messages format: {"messages": [{"role": "user", ...}, {"role": "assistant", ...}]}':this.activeType==="preference"?'Pairwise chosen vs rejected format: {"prompt": "...", "chosen": "...", "rejected": "..."}':"Full provenance records: prompt, model, medium, seed, ratings, lineage"}
              </span>
              <button class="btn-primary" id="download-dataset-btn" style="padding: 6px 14px; font-size: 0.82rem;">
                ⬇ Download File
              </button>
            </div>

            <pre style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 12px; font-family: var(--font-mono); font-size: 0.78rem; max-height: 320px; overflow: auto; white-space: pre-wrap; color: #d4d4d4;">${Ge(s)}</pre>
          </div>

          <div class="modal-footer">
            <button class="btn-secondary" id="done-dataset-modal">Done</button>
          </div>
        </div>
      `;const i=()=>e.remove();e.querySelector("#close-dataset-modal")?.addEventListener("click",i),e.querySelector("#done-dataset-modal")?.addEventListener("click",i),e.querySelector("#tab-sft")?.addEventListener("click",()=>{this.activeType="sft",t()}),e.querySelector("#tab-pref")?.addEventListener("click",()=>{this.activeType="preference",t()}),e.querySelector("#tab-session")?.addEventListener("click",()=>{this.activeType="session",t()}),e.querySelector("#download-dataset-btn")?.addEventListener("click",()=>{if(this.activeType==="sft"){const r=D(this.sessionStore,"all");L(r,`artist_studio_sft_${Date.now()}.jsonl`,"application/x-jsonlines")}else if(this.activeType==="preference"){const r=q(this.sessionStore);L(r,`artist_studio_preference_${Date.now()}.jsonl`,"application/x-jsonlines")}else{const r=j(this.sessionStore);L(r,`artist_studio_session_${Date.now()}.json`,"application/json")}})};t(),document.body.appendChild(e)}}function Ge(a){return String(a).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}class je{constructor({artistRegistry:e,mediaRegistry:t,onSaveSettings:s}){this.artistRegistry=e,this.mediaRegistry=t,this.onSaveSettings=s,this.ollamaModels=[],this.hasWebGPU=typeof navigator<"u"&&!!navigator.gpu}async open(){const e=this.artistRegistry.get("ollama");e&&(this.ollamaModels=await e.fetchAvailableModels());const t=document.createElement("div");t.className="modal-backdrop",t.id="settings-modal-backdrop";const s=this.artistRegistry.get("webgpu"),i=this.mediaRegistry.get("pixel");t.innerHTML=`
      <div class="modal-content" style="max-width: 640px;">
        <div class="modal-header">
          <h2 style="font-size: 1.1rem; color: var(--text-primary);">Studio Settings & Hardware</h2>
          <button class="btn-icon" id="close-settings-modal">✕</button>
        </div>

        <div class="modal-body">
          <!-- Ollama Section -->
          <div style="background: var(--bg-tertiary); padding: 14px; border-radius: 6px; border: 1px solid var(--border-color);">
            <h3 style="font-size: 0.92rem; margin-bottom: 8px; color: var(--text-primary);">Ollama (Local Backend)</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <div class="slider-group">
                <label>Endpoint URL</label>
                <input type="text" id="setting-ollama-endpoint" value="${e?.endpoint||"http://localhost:11434"}" class="prompt-input" style="padding: 6px 10px; font-size: 0.85rem;" />
              </div>
              <div class="slider-group">
                <label>Model</label>
                <select id="setting-ollama-model" style="background: var(--bg-primary); color: #fff; border: 1px solid var(--border-color); padding: 6px 8px; border-radius: 4px; font-size: 0.85rem;">
                  ${this.ollamaModels.length>0?this.ollamaModels.map(n=>`<option value="${n}" ${n===e?.model?"selected":""}>${n}</option>`).join(""):`<option value="${e?.model||"liquidai/lfm2.5-1.2b-instruct:latest"}">${e?.model||"liquidai/lfm2.5-1.2b-instruct:latest"}</option>`}
                </select>
              </div>
            </div>
            <div style="margin-top: 8px; font-size: 0.75rem; color: var(--text-muted);">
              Ollama Status: ${this.ollamaModels.length>0?`<span style="color: var(--accent-success)">● Connected (${this.ollamaModels.length} models found)</span>`:'<span style="color: var(--accent-warning)">▲ Not detected on localhost:11434</span>'}
            </div>
          </div>

          <!-- WebGPU Section -->
          <div style="background: var(--bg-tertiary); padding: 14px; border-radius: 6px; border: 1px solid var(--border-color);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <h3 style="font-size: 0.92rem; color: var(--text-primary);">In-Browser WebGPU (Transformers.js)</h3>
              <span class="badge" style="background: ${this.hasWebGPU?"rgba(62, 207, 142, 0.15)":"rgba(245, 166, 35, 0.15)"}; color: ${this.hasWebGPU?"var(--accent-success)":"var(--accent-warning)"};">
                ${this.hasWebGPU?"● WebGPU Ready":"▲ WASM CPU Fallback"}
              </span>
            </div>
            <div class="slider-group">
              <label>Model Preset</label>
              <select id="setting-webgpu-model" style="background: var(--bg-primary); color: #fff; border: 1px solid var(--border-color); padding: 6px 8px; border-radius: 4px; font-size: 0.85rem;">
                ${se.map(n=>`<option value="${n.id}" ${n.id===s?.modelId?"selected":""}>${n.name}</option>`).join("")}
              </select>
            </div>
            <p style="margin-top: 8px; font-size: 0.75rem; color: var(--text-muted);">
              Runs completely locally inside the browser memory without needing any external server.
            </p>
          </div>

          <!-- Pixel Medium Resolution -->
          <div style="background: var(--bg-tertiary); padding: 14px; border-radius: 6px; border: 1px solid var(--border-color);">
            <h3 style="font-size: 0.92rem; margin-bottom: 8px; color: var(--text-primary);">Pixel Grid Resolution</h3>
            <div class="slider-group">
              <select id="setting-pixel-grid" style="background: var(--bg-primary); color: #fff; border: 1px solid var(--border-color); padding: 6px 8px; border-radius: 4px; font-size: 0.85rem;">
                <option value="16x16" ${i?.cols===16&&i?.rows===16?"selected":""}>16 × 16 (Icon/Sprite)</option>
                <option value="32x32" ${i?.cols===32&&i?.rows===32?"selected":""}>32 × 32 (Square)</option>
                <option value="32x48" ${i?.cols===32&&i?.rows===48?"selected":""}>32 × 48 (Default Portrait)</option>
                <option value="64x64" ${i?.cols===64&&i?.rows===64?"selected":""}>64 × 64 (Detailed Grid)</option>
              </select>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-primary" id="save-settings-btn">Save Settings</button>
        </div>
      </div>
    `,document.body.appendChild(t);const r=()=>t.remove();t.querySelector("#close-settings-modal")?.addEventListener("click",r),t.addEventListener("click",n=>{n.target===t&&r()}),t.querySelector("#save-settings-btn")?.addEventListener("click",()=>{const n=t.querySelector("#setting-ollama-endpoint")?.value,o=t.querySelector("#setting-ollama-model")?.value,l=t.querySelector("#setting-webgpu-model")?.value,c=t.querySelector("#setting-pixel-grid")?.value;if(e&&(n&&(e.endpoint=n),o&&(e.model=o)),s&&l&&(s.modelId=l),i&&c){const[u,d]=c.split("x").map(Number);i.reset({cols:u,rows:d})}this.onSaveSettings&&this.onSaveSettings(),r()})}}class De{constructor(){this.artistRegistry=ae,this.mediaRegistry=ue,this.sessionStore=me,this.activeMediumId="watercolor",this.activeMode="draw",this.statusBanner=new Pe,this.candidateGrid=new Re({onSelectCandidate:e=>this.handleSelectCandidate(e),onVariations:e=>this.handleVariations(e),onContinue:e=>this.handleContinue(e),onCritique:e=>this.handleCritique(e),onCompareMedia:e=>this.handleCompareMedia(e),onStartOver:()=>this.handleStartOver(),onRate:(e,t)=>this.handleRate(e,t)}),this.programEditor=new Oe({onProgramChange:(e,t)=>this.handleProgramEdit(e,t),onRenderWithOtherMedium:e=>this.handleSwapMedium(e)}),this.rewardPanel=new ze({onApplyOptimizedProgram:e=>this.handleApplyOptimizedProgram(e)}),this.compareModal=new Le({flatMedium:this.mediaRegistry.get("flat"),watercolorMedium:this.mediaRegistry.get("watercolor")}),this.datasetModal=new Be({sessionStore:this.sessionStore}),this.settingsModal=new je({artistRegistry:this.artistRegistry,mediaRegistry:this.mediaRegistry,onSaveSettings:()=>this.handleSettingsSaved()}),this.controls=new Ee({artists:this.artistRegistry.list(),media:this.mediaRegistry.list(),activeArtist:this.artistRegistry.activeId,activeMedium:this.activeMediumId,activeMode:this.activeMode,onArtistChange:e=>this.handleArtistChange(e),onMediumChange:e=>this.handleMediumChange(e),onModeChange:e=>this.handleModeChange(e),onGenerate:e=>this.handleGenerate(e),onLoadExample:e=>this.handleLoadExample(e),onOpenSettings:()=>this.settingsModal.open()})}async init(e){this.root=e,this.root.innerHTML=`
      <div id="controls-container"></div>
      <div id="status-banner-container"></div>
      <main class="studio-main">
        <div id="studio-view" class="studio-grid-layout">
          <div id="candidate-grid-container"></div>
          <div id="program-editor-container"></div>
        </div>
        <div id="reward-lab-container" style="display: none;"></div>
      </main>
    `,this.controls.render(this.root.querySelector("#controls-container")),this.statusBanner.render(this.root.querySelector("#status-banner-container"));const t=this.sessionStore.getCurrentCandidates();if(t.length>0){await this.renderCandidates(t);const s=this.sessionStore.getActiveCandidate();s&&(this.programEditor.update(s,this.getActiveMedium().capabilities()),this.rewardPanel.update(s))}else P.length>0&&await this.handleLoadExample(P[0])}getActiveArtist(){return this.artistRegistry.getActive()}getActiveMedium(){return this.mediaRegistry.get(this.activeMediumId)||this.mediaRegistry.get("watercolor")}async handleGenerate(e,t=null,s=null,i=null){this.controls.setGenerating(!0);const r=this.getActiveArtist(),n=this.getActiveMedium();try{const o=await r.generate({prompt:e,count:4,mediumCapabilities:n.capabilities(),previousProgram:t,feedback:s});let l=0,c=0,u=0;const d=[];for(let h=0;h<o.length;h++){const m=o[h];l+=m.generationTimeMs||0,u+=m.program.actions?.length||0;const y=performance.now(),p=await n.render(m.program),b=Math.round(performance.now()-y);c+=b;const g=this.sessionStore.createCandidate({prompt:e,model:r.name,medium:n.name,program:m.program,parentId:i,generation:this.sessionStore.generations.length,renderMetadata:{executionTimeMs:m.generationTimeMs,renderTimeMs:b,warnings:[...m.warnings||[],...p.warnings||[]]},rawResponse:m.rawResponse});g.renderedImage=p.image,d.push(g)}this.sessionStore.addGeneration({prompt:e,candidates:d,parentId:i}),this.candidateGrid.update(d,d[0]?.id),this.programEditor.update(d[0],n.capabilities()),this.rewardPanel.update(d[0]),this.statusBanner.update({model:r.name,medium:n.name,generationTimeMs:Math.round(l/d.length),renderTimeMs:Math.round(c/d.length),actionCount:d[0]?.program?.actions?.length||0,generationIndex:this.sessionStore.currentGeneration})}catch(o){alert("Generation error: "+o.message),console.error(o)}finally{this.controls.setGenerating(!1)}}async handleVariations(e){const t=this.sessionStore.findCandidate(e);t&&await this.handleGenerate(t.prompt,t.program,null,t.id)}async handleContinue(e){const t=this.sessionStore.findCandidate(e);t&&await this.handleGenerate(t.prompt+" (continuation)",t.program,null,t.id)}async handleCritique(e){const t=this.sessionStore.findCandidate(e);if(!t)return;const s=prompt(`Human Critique for Candidate ${t.id.slice(-4)}:
(e.g. "more empty space", "shift forms left", "redder palette")`,"more empty space, redder palette");s&&s.trim()&&(this.sessionStore.setFeedback(e,s.trim()),await this.handleGenerate(t.prompt,t.program,s.trim(),t.id))}handleCompareMedia(e){const t=this.sessionStore.findCandidate(e);t&&this.compareModal.open(t)}handleStartOver(){confirm("Start a new session? Current session history will be saved in archive.")&&(this.sessionStore.clearSession(),this.candidateGrid.update([]),this.programEditor.update(null),this.rewardPanel.update(null))}handleRate(e,t){this.sessionStore.rateCandidate(e,t);const s=this.sessionStore.getCurrentCandidates();this.candidateGrid.update(s,this.sessionStore.activeCandidateId)}async handleSelectCandidate(e){this.sessionStore.selectCandidate(e);const t=this.sessionStore.getActiveCandidate(),s=this.getActiveMedium();this.candidateGrid.update(this.sessionStore.getCurrentCandidates(),e),this.programEditor.update(t,s.capabilities()),this.rewardPanel.update(t),t&&this.statusBanner.update({actionCount:t.program?.actions?.length||0,generationTimeMs:t.renderMetadata?.executionTimeMs||0,renderTimeMs:t.renderMetadata?.renderTimeMs||0})}async handleProgramEdit(e,t){this.sessionStore.updateCandidateProgram(e,t);const s=this.sessionStore.findCandidate(e),i=this.getActiveMedium(),r=performance.now(),n=await i.render(t),o=Math.round(performance.now()-r);s&&(s.renderedImage=n.image,s.renderMetadata.renderTimeMs=o),this.candidateGrid.update(this.sessionStore.getCurrentCandidates(),e),this.rewardPanel.update(s),this.statusBanner.update({actionCount:t.actions?.length||0,renderTimeMs:o})}async handleSwapMedium(e){const t=this.mediaRegistry.list(),i=(t.findIndex(n=>n.id===this.activeMediumId)+1)%t.length,r=t[i];this.activeMediumId=r.id,this.controls.activeMedium=r.id,this.controls.render(this.root.querySelector("#controls-container")),await this.handleProgramEdit(e.id,e.program)}handleApplyOptimizedProgram(e){const t=this.sessionStore.getActiveCandidate();t&&this.handleProgramEdit(t.id,e)}handleArtistChange(e){this.artistRegistry.setActive(e),this.statusBanner.update({model:this.getActiveArtist().name})}async handleMediumChange(e){this.activeMediumId=e;const t=this.getActiveMedium();this.statusBanner.update({medium:t.name});const s=this.sessionStore.getCurrentCandidates();for(const r of s){const n=await t.render(r.program);r.renderedImage=n.image}this.candidateGrid.update(s,this.sessionStore.activeCandidateId);const i=this.sessionStore.getActiveCandidate();i&&this.programEditor.update(i,t.capabilities())}handleModeChange(e){this.activeMode=e;const t=this.root.querySelector("#studio-view"),s=this.root.querySelector("#reward-lab-container");e==="reward"?(t.style.display="none",s.style.display="block",this.rewardPanel.render(s)):e==="datasets"?this.datasetModal.open():(t.style.display="grid",s.style.display="none")}async handleLoadExample(e){this.activeMediumId=e.medium,this.controls.activeMedium=e.medium,this.controls.render(this.root.querySelector("#controls-container"));const t=this.getActiveMedium(),s=await t.render(e.program),i=this.sessionStore.createCandidate({prompt:e.name,model:"Handcrafted Example",medium:t.name,program:e.program,renderMetadata:{executionTimeMs:0,renderTimeMs:s.executionTimeMs,actionCount:e.program.actions?.length||0}});i.renderedImage=s.image,this.sessionStore.addGeneration({prompt:e.name,candidates:[i]}),this.candidateGrid.update([i],i.id),this.programEditor.update(i,t.capabilities()),this.rewardPanel.update(i),this.statusBanner.update({model:"Handcrafted Example",medium:t.name,actionCount:e.program.actions?.length||0,generationTimeMs:0,renderTimeMs:s.executionTimeMs,generationIndex:this.sessionStore.currentGeneration})}async renderCandidates(e){const t=this.getActiveMedium();for(const s of e)if(!s.renderedImage){const i=await t.render(s.program);s.renderedImage=i.image}this.candidateGrid.update(e,this.sessionStore.activeCandidateId)}handleSettingsSaved(){this.statusBanner.update({model:this.getActiveArtist().name,medium:this.getActiveMedium().name})}}window.addEventListener("DOMContentLoaded",()=>{const a=document.querySelector("#app");if(a){const e=new De;window.app=e,e.init(a)}});
