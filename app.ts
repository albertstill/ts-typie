#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import fetch from 'node-fetch';
import chalk from 'chalk';
import * as figures from 'figures';
import * as args from 'args';
import * as commandExists from 'command-exists';


// list of supported package manager tools
// the first one found will be default
const tools = {
    yarn: { command: 'yarn add -D' },
    npm: { command: 'npm install -D' }
};

// look for the first available tool
let defaultTool;
for (const tool of Object.keys(tools)) {
    if (commandExists.sync(tool)) {
        defaultTool = tool;
        break;
    }
}
if (defaultTool === undefined) {
    console.error('Couldn\'t find a supported package manager tool.')
}

// support for overriding default
args.option('tool', 'Which package manager tool to use', defaultTool);
const opts = args.parse(process.argv, {
    name: 'ts-typie',
    mri: undefined,
    mainColor: 'yellow',
    subColor: 'dim'
});
const tool = tools[opts.tool];
console.log(chalk.blue(`Using ${opts.tool}`));

// check if package.json exists

const cwd = process.cwd();
const packagePath = path.join(cwd, 'package.json');

if (!fs.existsSync(packagePath)) {
    console.error('No package.json file found!');
    process.exit();
}

// Package.json exists

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

const depsObject = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
}

// Filter out already installed types
const alreadyInstalledTypes: string[] = Object.keys(depsObject).filter(d => /^@types\//.test(d));;
const dependencies: string[] = Object.keys(depsObject).filter(d => !/^@types\//.test(d));

console.log(chalk.blue(`Will check ${dependencies.length} deps from devDependencies and dependencies`));

(async () => {
    const findTypesToInstall: Array<Promise<null | string>> = dependencies.map(async (dependency) => {
        const dependencyString = chalk.bold(dependency)

        // Check if types are already installed

        if (alreadyInstalledTypes.includes('@types/' + dependency)) {
            console.log(chalk.yellow(figures.play, `Types for ${dependencyString} already installed. Skipping...`));
            return null;
        }

        // Check for included types
        let pkgPath = path.join(cwd, 'node_modules', dependency, 'package.json');


        if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            if (pkg.types || pkg.typings) {
                console.log(chalk.yellow(figures.warning, `Module ${dependencyString} includes own types. Skipping...`));
                return null;
            }
        }

        const typePackage = '@types/' + dependency

        // Check if types are available on registry API
        const response = await fetch('https://registry.npmjs.org/' + typePackage)

        if (response.status == 200) {
            console.log(chalk.green(figures.tick, `Type found for ${typePackage} in registry.`));
            return dependency;
        } else {
            console.log(chalk.red(figures.cross, `No types found for ${dependencyString} in registry. Skipping...`));
            return null;
        }
    })

    console.log(chalk.blue('Communicating with npm to check for types...'));

    const typesToInstall = (await Promise.all(findTypesToInstall)).filter((maybeString): maybeString is string => !!maybeString)

    console.log(chalk.green(figures.tick, `Found ${typesToInstall.length} @type packages to install...`));

    // yarn add cli asks you what version you want if it doesn't have the equivalent semver version, npm errors
    // for example if you had package@^2.0 but @types/package@^2.0 did not exist, yarn would ask what you wanted.
    // only adding version for yarn
    const hasInteractiveInstallerForVersionMismatch = opts.tool === 'yarn';

    const installCmd =
        `${tool.command} ${typesToInstall.map(dependency => `@types/${dependency}${hasInteractiveInstallerForVersionMismatch ? `@${depsObject[dependency]}` : ''}`).join(' ')}`

    console.log(installCmd)
    execSync(installCmd, { stdio: 'inherit' });
})()    