import { useMemo, useState } from 'react';
import ProjectCard from '../components/ProjectCard';
import { allTags, projects } from '../data/projects';

export default function Projects() {
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState('All');

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return projects.filter(project => {
      const matchesTag = activeTag === 'All' || project.tags.includes(activeTag);
      const matchesQuery =
        term === '' ||
        project.title.toLowerCase().includes(term) ||
        project.description.toLowerCase().includes(term) ||
        project.tags.some(tag => tag.toLowerCase().includes(term));
      return matchesTag && matchesQuery;
    });
  }, [query, activeTag]);

  return (
    <div className="page">
      <h1>Projects</h1>
      <p className="page-intro">Things I have built, shipped, and had to maintain.</p>

      <div className="filters">
        <input
          type="search"
          className="search"
          placeholder="Search projects"
          aria-label="Search projects"
          data-testid="project-search"
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
        <div className="tag-filters">
          {['All', ...allTags].map(tag => (
            <button
              key={tag}
              type="button"
              className={tag === activeTag ? 'chip active' : 'chip'}
              aria-pressed={tag === activeTag}
              onClick={() => setActiveTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      <h2>Results</h2>
      <p data-testid="result-count">
        Showing {visible.length} of {projects.length} projects
      </p>

      {visible.length === 0 ? (
        <p className="empty" data-testid="empty-state">
          No projects match your filters.
        </p>
      ) : (
        <div className="grid" data-testid="project-grid">
          {visible.map(project => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
