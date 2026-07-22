import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import CompetitionPublicForm from './pages/CompetitionPublicForm';
import './index.css';

const competitionMatch = window.location.pathname.match(/^\/competition\/([^/]+)\/?$/);
const root = ReactDOM.createRoot(document.getElementById('root'));

if (competitionMatch) {
  root.render(
    <React.StrictMode>
      <CompetitionPublicForm token={decodeURIComponent(competitionMatch[1])} />
    </React.StrictMode>
  );
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
