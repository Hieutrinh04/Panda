export function Header({title,onProfile}:{title:string;onProfile:()=>void}){return <header><div><h1>{title}</h1></div><button className="profile" onClick={onProfile}>A</button></header>}
