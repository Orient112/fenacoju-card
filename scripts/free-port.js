import { execSync } from 'child_process';

const port = process.argv[2] || '3001';

function freePortWindows(targetPort) {
  try {
    const output = execSync(`netstat -ano | findstr :${targetPort}`, { encoding: 'utf8' });
    const pids = new Set();

    for (const line of output.split('\n')) {
      if (!line.includes('LISTENING')) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0') pids.add(pid);
    }

    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        console.log(`Port ${targetPort} libéré (processus ${pid})`);
      } catch {
        // Processus déjà arrêté
      }
    }
  } catch {
    // Aucun processus sur ce port
  }
}

function freePortUnix(targetPort) {
  try {
    execSync(`lsof -ti:${targetPort} | xargs kill -9`, { stdio: 'ignore', shell: true });
    console.log(`Port ${targetPort} libéré`);
  } catch {
    // Aucun processus sur ce port
  }
}

if (process.platform === 'win32') {
  freePortWindows(port);
} else {
  freePortUnix(port);
}
