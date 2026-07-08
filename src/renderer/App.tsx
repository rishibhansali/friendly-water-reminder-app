import { DEFAULT_REMINDER_INTERVAL_MINUTES } from '../shared/constants';

function App() {
  return (
    <div style={{ fontFamily: 'sans-serif', padding: '1rem' }}>
      <h1>Friendly Water Reminder</h1>
      <p>Scaffold OK. Default reminder interval: {DEFAULT_REMINDER_INTERVAL_MINUTES} min.</p>
    </div>
  );
}

export default App;
