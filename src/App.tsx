import { useEffect, useState } from "react";
import { Link } from "./components/common";
import { Feed } from "./components/Feed";
import { Leaderboard } from "./components/Leaderboard";
import { NewPick } from "./components/NewPick";
import { Profile } from "./components/Profile";
import { Rules } from "./components/Rules";
import { CURRENT_USER_ID } from "./data/seed";

function useHashRoute() {
  const get = () => window.location.hash.replace(/^#/, "") || "/feed";
  const [route, setRoute] = useState(get);
  useEffect(() => {
    const on = () => {
      setRoute(get());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

const NAV = [
  { to: "/feed", label: "Feed", icon: "🏠" },
  { to: "/leaders", label: "Leaders", icon: "🏆" },
  { to: "/new", label: "Post", icon: "➕" },
  { to: `/u/${CURRENT_USER_ID}`, label: "Me", icon: "👤" },
  { to: "/rules", label: "Rules", icon: "📘" },
];

export default function App() {
  const route = useHashRoute();
  const profile = route.match(/^\/u\/(.+)$/);

  let page;
  let title = "Prop Junkies";
  if (route === "/leaders") (page = <Leaderboard />), (title = "Leaderboard");
  else if (route === "/new") (page = <NewPick onDone={() => (window.location.hash = `/u/${CURRENT_USER_ID}`)} />), (title = "New pick");
  else if (route === "/rules") (page = <Rules />), (title = "Rules");
  else if (profile) (page = <Profile key={profile[1]} userId={profile[1]} />), (title = "Profile");
  else page = <Feed />;

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/feed" className="brand">
          <span className="brand-mark">PJ</span> Prop Junkies
        </Link>
        <span className="topbar-title">{title}</span>
      </header>
      <main>{page}</main>
      <nav className="tabbar">
        {NAV.map((n) => (
          <a key={n.to} href={`#${n.to}`} className={route === n.to ? "tab active" : "tab"}>
            <span aria-hidden>{n.icon}</span>
            {n.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
