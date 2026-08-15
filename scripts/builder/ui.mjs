/** Terminal UI: colors, symbols, banners, and the prompting primitives. */
import {createInterface} from 'node:readline/promises';
import {stdin as input, stdout as output} from 'node:process';

const supportsColor =
    output.isTTY && !process.env.NO_COLOR && process.env.FORCE_COLOR !== '0' && process.env.TERM !== 'dumb';
const paint = (code, text) => (supportsColor ? `\u001b[${code}m${text}\u001b[0m` : String(text));

export const ui = {
    cyan: text => paint('96', text),
    green: text => paint('92', text),
    yellow: text => paint('93', text),
    red: text => paint('91', text),
    magenta: text => paint('95', text),
    dim: text => paint('2', text),
    bold: text => paint('1', text),
};

const symbols =
    process.platform === 'win32'
        ? {ok: '+', fail: 'x', warn: '!', bullet: '*', empty: 'o', q: '?'}
        : {ok: '✔', fail: '✖', warn: '⚠', bullet: '●', empty: '○', q: '?'};

export const ok = text => console.log(paint('92', `${symbols.ok} ${text}`));
export const fail = text => console.log(paint('91', `${symbols.fail} ${text}`));
export const warning = text => console.log(paint('93', `${symbols.warn} ${text}`));
export const success = text => console.log(`\n${paint('92', `${symbols.ok} ${text}`)}`);

const boxChars =
    process.platform === 'win32'
        ? {tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|'}
        : {tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│'};

/** Strip ANSI escape sequences so banner padding uses the visible length. */
const visibleLength = text => String(text).replace(/\u001b\[[0-9;]*m/g, '').length;

export const banner = version => {
    const width = 56;
    const line = boxChars.h.repeat(width);
    const center = text => {
        const pad = Math.max(0, width - visibleLength(text));
        const left = Math.floor(pad / 2);
        return `${boxChars.v}${' '.repeat(left)}${text}${' '.repeat(pad - left)}${boxChars.v}`;
    };
    console.log(`\n${ui.cyan(`${boxChars.tl}${line}${boxChars.tr}`)}`);
    console.log(ui.cyan(center('OpenDoc UI Builder')));
    console.log(ui.cyan(center(ui.dim(`npm run make · v${version}`))));
    console.log(ui.cyan(center(ui.dim('guided clean build'))));
    console.log(ui.cyan(`${boxChars.bl}${line}${boxChars.br}\n`));
};

export const section = title => console.log(`\n${ui.bold(ui.cyan(`── ${title}`))}`);
export const note = text => console.log(ui.dim(`   ${text}`));
export const hline = () => console.log(ui.dim(boxChars.h.repeat(56)));

// ---------------------------------------------------------------------------
// Prompting
// ---------------------------------------------------------------------------

const question = text => `${ui.cyan(`${symbols.q}`)} ${text} `;

// Piped-input fallback: Node readline/promises answers only one question when
// stdin is a pipe (the interface closes before the next question subscribes).
// For non-TTY input we read lines from a buffered queue instead, so the CLI
// stays scriptable. If the pipe ends early, prompts fail with a clear error.
const piped = !input.isTTY;
let pipedBuffer = '';
const pipedQueue = [];
const pipedWaiters = [];
if (piped) {
    input.setEncoding('utf8');
    input.on('data', chunk => {
        pipedBuffer += chunk;
        let index;
        while ((index = pipedBuffer.indexOf('\n')) >= 0) {
            pipedQueue.push(pipedBuffer.slice(0, index).replace(/\r$/, ''));
            pipedBuffer = pipedBuffer.slice(index + 1);
            const waiter = pipedWaiters.shift();
            if (waiter) waiter(pipedQueue.shift() ?? null);
        }
    });
    input.on('end', () => {
        if (pipedBuffer) pipedQueue.push(pipedBuffer);
        pipedBuffer = '';
        while (pipedWaiters.length > 0) {
            const waiter = pipedWaiters.shift();
            waiter(pipedQueue.shift() ?? null);
        }
    });
}

const readPipedLine = () =>
    new Promise(resolve => {
        if (pipedQueue.length > 0) resolve(pipedQueue.shift());
        else pipedWaiters.push(resolve);
    });

/** @returns {{ask, confirm, select, askHidden}} bound to the shared readline. */
export const createPrompter = () => {
    let rl = null;
    const attachReadline = readline => {
        rl = readline;
    };

    const readInputLine = async promptText => {
        output.write(promptText);
        if (piped) return (await readPipedLine())?.trim() ?? null;
        return (await rl.question(promptText)).trim();
    };

    async function ask(text, {default: dflt, validate} = {}) {
        const suffix = dflt !== undefined ? ui.dim(` [${dflt}]`) : '';
        for (;;) {
            const raw = await readInputLine(`${question(text)}${suffix}`);
            if (raw === null) throw new Error('Input closed before all questions were answered.');
            const value = raw === '' && dflt !== undefined ? String(dflt) : raw;
            if (value === '' && dflt !== '') {
                console.log(ui.red('   Please enter a value.'));
                continue;
            }
            if (validate) {
                const result = validate(value);
                if (result !== true) {
                    console.log(ui.red(`   ${result}`));
                    continue;
                }
            }
            return value;
        }
    }

    async function confirm(text, dflt = false) {
        const suffix = dflt ? ui.green('[Y/n]') : ui.dim('[y/N]');
        for (;;) {
            const raw = await readInputLine(`${question(text)}${suffix} `);
            if (raw === null) throw new Error('Input closed before all questions were answered.');
            const answer = raw.toLowerCase();
            if (answer === '') return dflt;
            if (answer === 'y' || answer === 'yes') return true;
            if (answer === 'n' || answer === 'no') return false;
            console.log(ui.red('   Please answer y or n.'));
        }
    }

    async function select(text, choices, {defaultIndex = 0} = {}) {
        console.log(`\n${question(text)}`);
        choices.forEach((choice, index) => {
            const marker = index === defaultIndex ? ui.green(symbols.bullet) : symbols.empty;
            const hint = choice.hint ? ui.dim(` — ${choice.hint}`) : '';
            console.log(`   ${marker} ${index + 1}) ${choice.label}${hint}`);
        });
        for (;;) {
            const raw = await readInputLine(`   ${ui.dim('Select')} [${defaultIndex + 1}]: `);
            if (raw === null) throw new Error('Input closed before all questions were answered.');
            const value = raw === '' ? String(defaultIndex + 1) : raw;
            const index = Number(value) - 1;
            if (Number.isInteger(index) && choices[index]) return choices[index].value;
            console.log(ui.red(`   Invalid choice. Enter a number between 1 and ${choices.length}.`));
        }
    }

    /** Read a secret without echoing it (raw-mode masking on a TTY; plain prompt on pipes). */
    async function askHidden(text, {validate} = {}) {
        if (piped) return ask(text, {validate});
        const suffix = ui.dim(' (input hidden)');
        for (;;) {
            const value = await new Promise(resolve => {
                rl?.pause();
                output.write(`${question(text)}${suffix} `);
                const wasRaw = input.isRaw;
                input.setRawMode(true);
                input.resume();
                input.setEncoding('utf8');
                let collected = '';
                const onData = chunk => {
                    for (const char of chunk) {
                        if (char === '\r' || char === '\n') {
                            input.removeListener('data', onData);
                            input.setRawMode(wasRaw);
                            input.pause();
                            output.write('\n');
                            resolve(collected);
                            return;
                        }
                        if (char === '\u0003') {
                            process.emit('SIGINT');
                            return;
                        }
                        if (char === '\u007f' || char === '\b') collected = collected.slice(0, -1);
                        else collected += char;
                    }
                };
                input.on('data', onData);
            });
            rl?.resume();
            if (validate) {
                const result = validate(value);
                if (result !== true) {
                    console.log(ui.red(`   ${result}`));
                    continue;
                }
            }
            return value;
        }
    }

    return {ask, confirm, select, askHidden, attachReadline};
};

/** Create the shared readline interface for TTY mode. */
export const createReadline = () => (piped ? null : createInterface({input, output}));
