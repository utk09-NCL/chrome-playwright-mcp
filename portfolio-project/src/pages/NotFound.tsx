import { Link } from 'react-router';

export default function NotFound() {
  return (
    <div className="page">
      <h1>404: Page not found</h1>
      <p className="page-intro">That page does not exist.</p>
      <Link className="button primary" to="/">
        Back to home
      </Link>
    </div>
  );
}
