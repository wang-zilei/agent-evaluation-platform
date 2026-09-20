import { Outlet } from 'react-router-dom';
import './platform-shell.css';

export default function PlatformShell() {
  return (
    <div className="platform-shell">
      <main className="platform-shell__content" id="main-content">
        <Outlet />
      </main>
    </div>
  );
}
