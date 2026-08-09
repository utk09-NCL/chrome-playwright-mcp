import { Link } from 'react-router';
import ProjectCard from '../components/ProjectCard';
import { projects } from '../data/projects';

const stats = [
  { label: 'Projects shipped', value: '24' },
  { label: 'Years experience', value: '6' },
  { label: 'Open-source PRs', value: '18' }
];

export default function Home() {
  return (
    <div className="page">
      <section className="hero">
        <p className="eyebrow">Front-end engineer</p>
        <h1>Hi, I am UT</h1>
        <p className="tagline" data-testid="hero-tagline">
          I build fast, accessible interfaces and the tests that keep them honest.
        </p>
        <div className="hero-actions">
          <Link className="button primary" to="/projects">
            View my work
          </Link>
          <Link className="button" to="/contact">
            Get in touch
          </Link>
        </div>
      </section>

      <section className="stats" aria-label="Career stats">
        {stats.map(stat => (
          <div key={stat.label} className="stat">
            <span className="stat-value">{stat.value}</span>
            <span className="stat-label">{stat.label}</span>
          </div>
        ))}
      </section>

      <section className="featured">
        <h2>Featured projects</h2>
        <div className="grid" data-testid="featured-grid">
          {projects.slice(0, 3).map(project => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      </section>
    </div>
  );
}
