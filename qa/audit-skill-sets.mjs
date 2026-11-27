/** Falsifiable skill-route contract; checks implementation integrity, NOT singing efficacy. */
const GRADES=new Set(["lim","trad"]);
const FOCI=new Set(["breath","pitch","coordination","song","speech","recovery"]);
const SOURCES=new Set(["RMT26","SOVT25","SOVT26","MAP26","ASHA","MOTOR26","NIDCD","GAME24"]);
const PROMISES=/(?:guaranteed? improvement|diagnos(?:e|is)|cures?|previene lesiones|garantiza|te cura)/i;

function shapeProblems(set,seen) {
  const errors=[];
  if(!/^[sv]-skill-[a-z]+$/.test(set.id||"")||seen.has(set.id)) errors.push(set.id+": bad or duplicate skill ID");
  seen.add(set.id);
  if(!["vocal","singing"].includes(set.track)) errors.push(set.id+": unsupported track");
  if((set.id||"")[0]!== (set.track==="vocal"?"v":"s")) errors.push(set.id+": wrong track prefix");
  if(set.kind!=="skill") errors.push(set.id+": not a skill-repair set");
  if(!GRADES.has(set.grade)) errors.push(set.id+": unearned evidence grade");
  if(!FOCI.has(set.focus)) errors.push(set.id+": unknown focus");
  if(!Array.isArray(set.evidence)||!set.evidence.length||
     set.evidence.some(id=>!SOURCES.has(id))) errors.push(set.id+": missing evidence");
  return errors;
}
function timingProblems(set,catalog) {
  const errors=[];
  const rows=Array.isArray(set.steps)?set.steps:[];
  const ids=rows.map(row=>row[0]);
  if(ids.length<2||ids.length>5||new Set(ids).size!==ids.length) errors.push(set.id+": invalid steps");
  let total=0;
  for(const [id,sec] of rows) {
    const ex=catalog.get(id);
    if(!ex) errors.push(set.id+": missing catalogue ID "+id);
    if(!Number.isInteger(sec)||sec<30||(ex&&sec>ex.timerDefaultSec)) errors.push(set.id+": unsafe timer "+id);
    total+=sec;
  }
  if(total<150||total>900) errors.push(set.id+": outside bounded session");
  return errors;
}
function wordsProblems(set,lang) {
  const errors=[];
  const words=set[lang];
  if(!words) return [set.id+": no "+lang+" translation"];
  for(const key of ["name","goal","cue","check","transfer","fallback","why","tip","src"]) {
    if(!String(words[key]||"").trim()) errors.push(set.id+": missing "+lang+"."+key);
  }
  if(String(words.name||"").length>28) errors.push(set.id+": mobile name too long");
  if(PROMISES.test([words.goal,words.check,words.transfer,words.why].join(" "))) errors.push(set.id+": unsupported clinical promise");
  return errors;
}
export function skillSetProblems(sets,catalog) {
  const errors=[];
  const seen=new Set();
  for(const set of sets) {
    errors.push(...shapeProblems(set,seen));
    errors.push(...timingProblems(set,catalog));
    errors.push(...wordsProblems(set,"es"),...wordsProblems(set,"en"));
    if(set.es?.goal===set.en?.goal||set.es?.transfer===set.en?.transfer) errors.push(set.id+": untranslated meaning");
  }
  return errors;
}
