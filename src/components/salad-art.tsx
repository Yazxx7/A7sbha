export default function SaladArt() {
  return <svg viewBox="0 0 280 240" className="photo-art-shadow h-full w-full" aria-hidden="true">
    <defs><radialGradient id="plate"><stop stopColor="#fff" /><stop offset="1" stopColor="#e4e8dd" /></radialGradient><radialGradient id="salad"><stop stopColor="#f3f3df" /><stop offset="1" stopColor="#dee5c9" /></radialGradient></defs>
    <ellipse cx="135" cy="210" rx="89" ry="12" fill="#71894d" opacity=".08" />
    <circle cx="135" cy="119" r="99" fill="url(#plate)" stroke="#fff" strokeWidth="3" />
    <circle cx="135" cy="119" r="82" fill="url(#salad)" stroke="#e0e4d4" />
    {[[83,103,-25],[111,66,25],[173,77,50],[189,128,90],[142,169,15],[92,157,-30],[156,122,70],[124,116,0]].map(([x,y,r],i)=><g key={i} transform={`translate(${x} ${y}) rotate(${r})`}><path d="M-25 0C-15-24 21-27 28-1 20 24-14 24-25 0" fill={i%2?'#81a759':'#4e8854'} /><path d="M-21 1 21-1M-11 1-1-15M-3 1 8 15M10 0 15-12" stroke="#bdd592" strokeWidth="1.3" fill="none" opacity=".8" /></g>)}
    {[[86,83],[166,144],[107,148],[158,70]].map(([x,y],i)=><g key={i} transform={`translate(${x} ${y}) rotate(${i*50})`}><path d="M-14-13A20 20 0 0 1 15 13Z" fill="#e77858" stroke="#d76449" strokeWidth="1" /><path d="M-10-7 8 7M-1-8 5 2" stroke="#f8c494" strokeWidth="2" /></g>)}
    {[[120,85],[165,100],[80,137],[156,173]].map(([x,y],i)=><g key={i} transform={`translate(${x} ${y}) rotate(${i*25})`}><ellipse rx="17" ry="11" fill="#b8d598" stroke="#679751" strokeWidth="3" /><ellipse rx="12" ry="7" fill="#dfebc2" /><path d="M-5-3 3 3M-1 4 2-3" stroke="#9bb879" strokeWidth="2" /></g>)}
    <g transform="translate(133 121) rotate(-20)"><path d="M-26-4Q-29-24-10-28L30-23Q39-13 27-1L-10 12Q-23 13-26-4" fill="#e5b981" stroke="#cf9c65" /><path d="M-14-21-3 9M-1-24 10 5M13-24 24-1" stroke="#b78b58" strokeWidth="2" opacity=".65" /></g>
    {[[103,104],[132,63],[185,113],[120,177],[71,118],[172,165]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="4" fill="#dfc786" />)}
    <g transform="translate(246 80) rotate(13)"><path d="M0 0V107" stroke="#bdc7b2" strokeWidth="6" strokeLinecap="round" /><path d="M-9 0V23Q0 34 9 23V0M0 0V24" stroke="#ced6c5" fill="none" strokeWidth="4" strokeLinecap="round" /></g>
    <path d="M17 169Q33 148 28 126Q6 135 17 169M17 167 25 140" fill="#91ac64" stroke="#78984e" strokeWidth="1.5" />
  </svg>;
}
