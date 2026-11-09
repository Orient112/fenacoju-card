import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import CompetitionPublicForm from './pages/CompetitionPublicForm';
import CompetitionWeighPage from './pages/CompetitionWeighPage';
import GradeExamPublicPage from './pages/GradeExamPublicPage';
import './index.css';

const weighMatch = window.location.pathname.match(/^\/competition\/([^/]+)\/pese\/?$/);
const competitionMatch = window.location.pathname.match(/^\/competition\/([^/]+)\/?$/);
const gradeExamMatch = window.location.pathname.match(/^\/grade-exam\/([^/]+)\/?$/);
const root = ReactDOM.createRoot(document.getElementById('root'));

if (weighMatch) {
  root.render(
    <React.StrictMode>
      <CompetitionWeighPage token={decodeURIComponent(weighMatch[1])} />
    </React.StrictMode>
  );
} else if (competitionMatch) {
  root.render(
    <React.StrictMode>
      <CompetitionPublicForm token={decodeURIComponent(competitionMatch[1])} />
    </React.StrictMode>
  );
} else if (gradeExamMatch) {
  root.render(
    <React.StrictMode>
      <GradeExamPublicPage token={decodeURIComponent(gradeExamMatch[1])} />
    </React.StrictMode>
  );
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
