import type { Project } from '../data/projects';

export default function ProjectCard({ project }: { project: Project }) {
  return (
    <article className="card" data-testid="project-card">
      <h3 className="card-title">{project.title}</h3>
      <p className="card-year">{project.year}</p>
      <p className="card-description">{project.description}</p>
      <ul className="tag-list">
        {project.tags.map(tag => (
          <li key={tag} className="tag">
            {tag}
          </li>
        ))}
      </ul>
      <a className="card-link" href={project.url} target="_blank" rel="noreferrer">
        View source
      </a>
    </article>
  );
}
