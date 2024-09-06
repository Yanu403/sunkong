// Import Libraries
const colors = require('colors');
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const readline = require('readline');
dayjs.extend(utc);
dayjs.extend(timezone);

function loadAccounts() {
  const data = fs.readFileSync(path.resolve(__dirname, 'data.json'), 'utf-8');
  return JSON.parse(data).accounts;
}

const accounts = loadAccounts();

// Constants
const headers = {
  authority: '',
  'Content-Type': 'application/json',
  Origin: '',
  scheme: 'https',
  Priority: 'u=1, i',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': 'Windows',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
};

const FORMAT_DATE_TIME = 'DD/MM/YYYY HH:mm';
const profile = new Map();
const currentAccount = new Map();
const currentProject = new Map();
const KEY_CURRENT_PROFILE = 'currentProfile';
const KEY_CURRENT_PROJECT = 'currentProject';

// Utility Functions
async function logs(message) {
  const { username } = await getCurrentProfile();
  const project = await getCurrentProject();
  console.log(
    colors.cyan(`[ ${project.toUpperCase()}${username ? ' - ' + username : ''} ]`),
    colors.green(message),
  );
}

async function errors(message) {
  const { username } = await getCurrentProfile();
  const project = await getCurrentProject();
  console.log(
    colors.red(`[ ${project.toUpperCase()}${username ? ' - ' + username : ''} ]`),
    colors.red(message),
  );
}

function toVietNamTime(timeUtc) {
  return dayjs.utc(timeUtc).tz('Asia/Ho_Chi_Minh').format(FORMAT_DATE_TIME);
}

async function setCurrentProfile(data) {
  currentAccount.set(KEY_CURRENT_PROFILE, data);
}

async function getCurrentProfile() {
  return currentAccount.get(KEY_CURRENT_PROFILE);
}

async function setCurrentProject(data) {
  currentProject.set(KEY_CURRENT_PROJECT, data);
}

async function getCurrentProject() {
  return currentProject.get(KEY_CURRENT_PROJECT);
}

async function getHeader({ isQueryId = false, url, method, customHeader, tokenType, typeQueryId = 'tma ' }) {
  const splitUrl = url.split('/');
  const domain = [...splitUrl].slice(0, 3).join('/');
  const path = '/' + [...splitUrl].slice(3).join('/');

  const authDomain = { Origin: domain, authority: domain, path: path, method: method };
  const { query_id, token } = await getCurrentProfile();

  if (isQueryId) {
    return {
      ...headers,
      ...authDomain,
      ...(typeQueryId === 'raw' ? { rawdata: query_id } : { Authorization: typeQueryId + query_id }),
      ...customHeader,
    };
  }
  return {
    ...headers,
    ...authDomain,
    Authorization: tokenType === 'Bearer' ? 'Bearer ' + token : tokenType + token,
    ...customHeader,
  };
}

async function callApi({ url, method, body = {}, isQueryId = false, headersCustom = {}, isAuth = true, typeQueryId, tokenType = 'Bearer' }) {
  try {
    const genHeaders = await getHeader({ isQueryId, url, method, headersCustom, tokenType, typeQueryId });
    if (!isAuth) {
      delete genHeaders.Authorization;
      delete genHeaders.rawdata;
    }
    if (isQueryId) {
      typeQueryId === 'raw' ? delete genHeaders.Authorization : delete genHeaders.rawdata;
    }
    const res = await fetch(url, {
      method: method,
      headers: genHeaders,
      ...(method !== 'GET' && { body: JSON.stringify(body) }),
    });
    const response = await res.json();

    if (!response || (response?.statusCode && (response?.statusCode === 500 || response?.statusCode === 401))) {
      errors('Gagal mengambil query_id atau token dari URL ini: ' + url + ` [ ${response?.message} ]`);
      return response;
    }
    return response;
  } catch (error) {
    errors('Terjadi kesalahan pada API: ' + error.message);
  }
}

async function login() {
  try {
    const url = 'https://uat-api.sunkong.cloud/v1/login';
    const account = await getCurrentProfile();
    const res = await callApi({ url: url, method: 'POST', body: { init_data: account?.query_id } });

    if (!res) {
      errors('Login gagal, silakan ambil kembali query_id!');
      return;
    }

    const { token: { access_token }, point } = res;
    await setCurrentProfile({ ...account, token: access_token });
    logs(`Saldo: ${colors.yellow(new Intl.NumberFormat('us-US').format(point))} 💰`);
    return access_token;
  } catch (error) {
    errors('Login gagal, silakan ambil kembali query_id! Error: ' + error.message);
  }
}

async function doQuest() {
  const url = 'https://uat-api.sunkong.cloud/v1/missions';
  const res = await callApi({ url: url, method: 'GET' });

  if (!res) {
    errors('Gagal mendapatkan daftar misi!');
    return;
  }

  const tasks = [...res];
  const excludeTask = ['INVITE'];
  const listQuestUnFinish = tasks.filter(e => !e.is_done && !excludeTask.includes(e?.type));

  if (listQuestUnFinish.length) {
    logs(`Memulai ${colors.cyan(listQuestUnFinish.length)} misi...`.white);
  } else {
    logs('Semua misi telah selesai.'.white);
    return;
  }

  const { username } = await getCurrentProfile();

  for await (const task of listQuestUnFinish) {
    const { id, title } = task;
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(`[ ${colors.magenta(`${username}`)} ]` + colors.yellow(` Misi: ${colors.white(title)} `) + colors.red('Sedang berlangsung... '));

    const isChecked = await checkTask(id);
    if (!isChecked) {
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(`[ ${colors.magenta(`${username}`)} ]` + colors.yellow(` Misi: ${colors.white(title)} `) + colors.red('Gagal memulai misi!'));
      console.log();
      continue;
    }

    await delay(2);

    const isFinish = await finishQuest(id);
    readline.cursorTo(process.stdout, 0);
    if (isFinish) {
      process.stdout.write(`[ ${colors.magenta(`${username}`)} ]` + colors.yellow(` Misi: ${colors.white(title)} `) + colors.green('Selesai!'));
    } else {
      process.stdout.write(`[ ${colors.magenta(`${username}`)} ]` + colors.yellow(` Misi: ${colors.white(title)} `) + colors.red('Gagal!'));
    }
    console.log();
  }
  logs('Semua misi selesai.');
  return true;
}

async function finishQuest(id) {
  try {
    const url = `https://uat-api.sunkong.cloud/v1/missions/claim/${id}`;
    const res = await callApi({ url: url, method: 'POST' });
    return res;
  } catch (error) {
    errors('Gagal menyelesaikan misi: ' + error.message);
  }
}

async function checkTask(id) {
  try {
    const url = `https://uat-api.sunkong.cloud/v1/missions/complete/${id}`;
    const res = await callApi({ url: url, method: 'POST' });
    return res;
  } catch (error) {
    errors('Gagal memeriksa misi: ' + error.message);
  }
}

async function checkFriendClaim() {
  try {
    const url = `https://uat-api.sunkong.cloud/v1/referral`;
    const res = await callApi({ url: url, method: 'GET' });

    if (!res) {
      errors('Gagal mendapatkan daftar teman!');
      return;
    }

    if (res?.claimable) {
      logs(`Terdapat ${res?.claimable} poin yang dapat diklaim dari teman!`);
      return res?.claimable;
    }
  } catch (error) {
    errors('Gagal memeriksa klaim teman: ' + error.message);
  }
}

async function claimFriend() {
  try {
    const url = `https://uat-api.sunkong.cloud/v1/referral/withdraw`;
    const res = await callApi({ url: url, method: 'POST' });

    if (!res) {
      errors('Gagal klaim poin dari teman!');
      return;
    }

    if (res) {
      logs('Berhasil klaim poin dari teman.');
      return;
    } else {
      logs('Tidak ada poin yang dapat diklaim.');
    }
  } catch (error) {
    errors('Gagal klaim poin dari teman: ' + error.message);
  }
}

// Main Function
async function main(account) {
  await setCurrentProfile(account);
  await login();
  await doQuest();
  const friendClaims = await checkFriendClaim();
  if (friendClaims) await claimFriend();
}

(async () => {
  await setCurrentProject('sunkong');

  for (const account of accounts) {
    logs(`Memulai proses untuk akun: ${account.username}`);
    await main(account);
    logs(`Selesai memproses akun: ${account.username}`);
    await delay(5);  // Penundaan di antara akun untuk menghindari deteksi
  }
})();
