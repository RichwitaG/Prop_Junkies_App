import { useEffect, useState } from "react";
import { Link } from "./components/common";
import { Feed } from "./components/Feed";
import { Leaderboard } from "./components/Leaderboard";
import { NewPick } from "./components/NewPick";
import { Profile } from "./components/Profile";
import { Rules } from "./components/Rules";
import { CURRENT_USER_ID } from "./data/seed";

const getRoute = () => window.location.hash.replace(/^#/, "") || "/feed";

// How many in-app pages deep we are, so Back only steps through history we created
// (a profile opened from a shared link goes to the feed instead of leaving the app).
let depth = 0;

function goBack() {
  if (depth > 0) window.history.back();
  else window.location.hash = "/feed";
}

function useHashRoute() {
  const [route, setRoute] = useState(getRoute);
  useEffect(() => {
    const on = (e: HashChangeEvent) => {
      // Going back to the previous URL means we popped a level; anything else pushed one.
      const prev = new URL(e.oldURL).hash.replace(/^#/, "") || "/feed";
      if (prevStack[prevStack.length - 1] === getRoute()) {
        prevStack.pop();
        depth = Math.max(0, depth - 1);
      } else {
        prevStack.push(prev);
        depth++;
      }
      setRoute(getRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

const prevStack: string[] = [];

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

  const isTab = NAV.some((n) => n.to === route) || route === "/feed";

  return (
    <div className="app">
      <header className="topbar">
        {isTab ? (
          <Link to="/feed" className="brand">
            <span className="brand-mark">PJ</span> Prop Junkies
          </Link>
        ) : (
          <button className="back" onClick={goBack} aria-label="Back">
            <span aria-hidden>‹</span> Back
          </button>
        )}
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
