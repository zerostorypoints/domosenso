// One source for how to start, shared by get-started, the markdown pages and llms.txt.
// installCommands must equal README.md "Start in 10 minutes" (install.test.ts).
export const installCommands='gh repo clone zerostorypoints/domosenso\ncd domosenso\nuv sync\nclaude';
export const starterPrompt='Use the onboard-home skill to help me configure my Home Assistant setup. Ask about my host, devices and goals. Create a separate home project and start with backups. Stop at the deployment plan so I can review it before any live changes.';
export const noHomeAssistant=[
 'No Home Assistant yet? The onboard-home skill can install Home Assistant Container with you from the home template\'s compose.yaml, then continue as above.',
 'This has been tried on a local container, not yet on a NAS. Synology DSM with Container Manager is the tested host; QNAP, Unraid or a mini PC with Docker take the same path and are not tested. Home Assistant OS (HAOS) is not covered.',
];
// README "For AI agents", as sentences.
export const agentRules=[
 'Clone this catalog with its tags and run the onboard-home skill from that clone.',
 'Domosenso is not a package yet: every command runs as `uv run --project <catalog clone> domosenso …`.',
 'Create the home with `domosenso init` in a separate folder, never inside the catalog.',
 'Never change the catalog in place: a contribution is a pull request from a fork.',
 'Stop at every question the skill asks the owner.',
];
