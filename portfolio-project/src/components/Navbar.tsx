import { NavLink } from 'react-router';
import ThemeToggle from './ThemeToggle';

const links = [
  { to: '/', label: 'Home' },
  { to: '/projects', label: 'Projects' },
  { to: '/contact', label: 'Contact' }
];

export default function Navbar() {
  return (
    <header className="navbar">
      <NavLink to="/" className="brand" data-testid="brand">
        UT
      </NavLink>
      <nav aria-label="Main">
        <ul className="nav-links">
          {links.map(link => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                end={link.to === '/'}
                className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
              >
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <ThemeToggle />
    </header>
  );
}
