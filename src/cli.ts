import * as readline from 'readline';
import { OrlonValue } from './page';
import BTree from './b-tree';
import Pager from './pager';
import WAL from './wal';

enum Command {
  SET = 'SET',
  GET = 'GET',
  DEL = 'DEL',
  EXIT = 'EXIT',
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

const wal = new WAL();
wal.open('./orlon.wal');

const pager = new Pager(wal);
pager.open('./orlon.db');

const tree = new BTree(pager, 2);
tree.open();

// Parse `SET key value` command
function parseValue(raw: string): OrlonValue {
  if (raw === 'null') return { type: 'null', value: null };
  if (raw === 'true') return { type: 'boolean', value: true };
  if (raw === 'false') return { type: 'boolean', value: false };
  if (/^\d+$/.test(raw)) return { type: 'integer', value: parseInt(raw) };
  if (/^\d+\.\d+$/.test(raw)) return { type: 'float', value: parseFloat(raw) };
  return { type: 'string', value: raw };
}

// Format `GET key` output
function formatValue(value: OrlonValue): string {
  if (value.type === 'null') return '(nil)';
  return String(value.value);
}

function cli(tree: BTree) {
  rl.question('> ', (input) => {
    const [command, ...args] = input.trim().split(/\s+/);
    switch (command.toUpperCase()) {
      case Command.SET: {
        if (args.length < 2) {
          console.log('Usage: SET key value');
          break;
        }

        const key = args[0];
        const value = parseValue(args.slice(1).join(' '));

        tree.insert(key, value);
        console.log('OK');

        break;
      }

      case Command.GET: {
        if (args.length !== 1) {
          console.log('Usage: GET key');
          break;
        }

        const key = args[0];
        const value = tree.search(key);

        console.log(value ? formatValue(value) : '(nil)');

        break;
      }

      case Command.DEL: {
        if (args.length !== 1) {
          console.log('Usage: DEL key');
          break;
        }

        const key = args[0];
        tree.delete(key);
        console.log('OK');

        break;
      }

      case Command.EXIT: {
        pager.close();
        rl.close();
        console.log('Goodbye!');
        return;
      }

      default:
        console.log(`Unknown command: ${command}`);
    }

    cli(tree)
  });
}

cli(tree);
