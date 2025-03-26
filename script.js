import * as THREE from './three.module.js';
import { PointerLockControls } from './PointerLockControls.js';

// --- 配置常量 ---
const WORLD_SIZE_X = 25;
const WORLD_SIZE_Y = 25;
const WORLD_SIZE_Z = 25;
const GROUND_Y = 10; // 地面Y坐标 (从下往上数)
const TEXTURE_SIZE = 16; // 贴图大小 (像素)
const BLOCK_SIZE = 1;  // 方块大小 (Three.js单位)

const PLAYER_HEIGHT = 1.8;
const PLAYER_SPEED = 5.0;
const JUMP_VELOCITY = 8.0;
const GRAVITY = -20.0;

// --- 全局变量 ---
let scene, camera, renderer, controls;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false, canJump = false;
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();
let clock = new THREE.Clock();
let world = {}; // 使用对象存储方块，键为 "x,y,z"
let textures = {}; // 存储生成的纹理
let materials = {}; // 存储基于纹理的材质
let instancedMeshes = {}; // 存储 InstancedMesh

// --- DOM 元素 ---
const blocker = document.getElementById('blocker');
const instructions = document.getElementById('instructions');

init();
animate();

// --- 初始化 ---
function init() {
    // 场景
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // 天空蓝
    scene.fog = new THREE.Fog(0x87CEEB, 0, 75); // 雾效

    // 相机
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(WORLD_SIZE_X / 2, GROUND_Y + PLAYER_HEIGHT, WORLD_SIZE_Z / 2);

    // 渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    // 光照
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(50, 50, 50);
    directionalLight.castShadow = false; // 简单起见，禁用阴影
    scene.add(directionalLight);

    // 生成纹理和材质
    generateTextures();
    createMaterials();

    // 创建世界
    createWorld();

    // 控制器 (Pointer Lock)
    controls = new PointerLockControls(camera, document.body);

    instructions.addEventListener('click', function () {
        controls.lock();
    });

    controls.addEventListener('lock', function () {
        instructions.style.display = 'none';
        blocker.style.display = 'none';
    });

    controls.addEventListener('unlock', function () {
        blocker.style.display = 'flex'; // 使用 flex 以便居中
        instructions.style.display = '';
    });

    scene.add(controls.getObject());

    // 键盘事件监听
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // 窗口大小调整处理
    window.addEventListener('resize', onWindowResize);
}

// --- 纹理生成 ---
function generateTexture(color1, color2) {
    const canvas = document.createElement('canvas');
    canvas.width = TEXTURE_SIZE;
    canvas.height = TEXTURE_SIZE;
    const context = canvas.getContext('2d');

    context.fillStyle = color1;
    context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

    context.fillStyle = color2;
    for (let i = 0; i < TEXTURE_SIZE * TEXTURE_SIZE * 0.3; i++) { // 随机添加一些噪点
        const x = Math.floor(Math.random() * TEXTURE_SIZE);
        const y = Math.floor(Math.random() * TEXTURE_SIZE);
        context.fillRect(x, y, 1, 1);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter; // 像素风格
    texture.minFilter = THREE.NearestFilter;
    return texture;
}

function generateTextures() {
    textures.grass_top = generateTexture('#6A994E', '#8AA77B');
    textures.dirt = generateTexture('#A47449', '#8B5E3C');
    textures.grass_side = generateTexture('#A47449', '#8B5E3C'); // 侧面用泥土纹理
    textures.wood = generateTexture('#6F4E37', '#5C4033'); // 树干
    textures.leaves = generateTexture('#386641', '#2A4830'); // 树叶
}

// --- 材质创建 ---
function createMaterials() {
    // 土地方块材质 (上草 下/侧泥土)
    materials.grass_dirt = [
        new THREE.MeshLambertMaterial({ map: textures.grass_side }), // +X
        new THREE.MeshLambertMaterial({ map: textures.grass_side }), // -X
        new THREE.MeshLambertMaterial({ map: textures.grass_top }),  // +Y
        new THREE.MeshLambertMaterial({ map: textures.dirt }),       // -Y
        new THREE.MeshLambertMaterial({ map: textures.grass_side }), // +Z
        new THREE.MeshLambertMaterial({ map: textures.grass_side })  // -Z
    ];
    // 纯泥土方块
    materials.dirt = new THREE.MeshLambertMaterial({ map: textures.dirt });
    // 树干方块
    materials.wood = new THREE.MeshLambertMaterial({ map: textures.wood });
    // 树叶方块
    materials.leaves = new THREE.MeshLambertMaterial({ map: textures.leaves });
}

// --- 世界生成 ---
function createWorld() {
    const worldVolume = WORLD_SIZE_X * WORLD_SIZE_Y * WORLD_SIZE_Z;
    const geometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);

    // 初始化 InstancedMeshes (估计最大数量)
    instancedMeshes.grass_dirt = new THREE.InstancedMesh(geometry, materials.grass_dirt, WORLD_SIZE_X * WORLD_SIZE_Z);
    instancedMeshes.dirt = new THREE.InstancedMesh(geometry, materials.dirt, worldVolume);
    instancedMeshes.wood = new THREE.InstancedMesh(geometry, materials.wood, worldVolume * 0.05); // 估计树木占的体积
    instancedMeshes.leaves = new THREE.InstancedMesh(geometry, materials.leaves, worldVolume * 0.1);

    // 计数器
    let counts = { grass_dirt: 0, dirt: 0, wood: 0, leaves: 0 };

    // 创建地面
    for (let x = 0; x < WORLD_SIZE_X; x++) {
        for (let z = 0; z < WORLD_SIZE_Z; z++) {
            // 地表草地
            addBlockInstance(x, GROUND_Y, z, 'grass_dirt', counts);
            // 地表下一层泥土
            for (let y = GROUND_Y - 1; y >= 0; y--) {
                addBlockInstance(x, y, z, 'dirt', counts);
            }
        }
    }

    // 创建树木
    const numTrees = Math.floor(Math.random() * 5) + 1; // [1, 5] 棵树
    for (let i = 0; i < numTrees; i++) {
        // 随机找一个地面上的位置 (避开边界一点)
        const treeX = Math.floor(Math.random() * (WORLD_SIZE_X - 4)) + 2;
        const treeZ = Math.floor(Math.random() * (WORLD_SIZE_Z - 4)) + 2;
        const treeBaseY = GROUND_Y + 1; // 树长在地面上

        // 检查是否与其他树太近 (简单检查)
        let tooClose = false;
        const keyBase = `${treeX},${treeBaseY},${treeZ}`;
        if (world[keyBase]) {
            tooClose = true; // 避免在同一格生成
        }
        // 更复杂的检查可以看周围格子

        if (!tooClose) {
            createTree(treeX, treeBaseY, treeZ, counts);
        } else {
            i--; // 重试一次
        }
    }

    // 设置最终的实例数量并添加到场景
    for (const type in instancedMeshes) {
        instancedMeshes[type].count = counts[type];
        scene.add(instancedMeshes[type]);
    }
}

// 辅助函数：添加方块实例
function addBlockInstance(x, y, z, type, counts) {
    const key = `${x},${y},${z}`;
    if (y < 0 || y >= WORLD_SIZE_Y || world[key]) return; // 防止重复或越界

    const mesh = instancedMeshes[type];
    if (!mesh) {
        console.warn(`Invalid block type: ${type}`);
        return;
    }

    const matrix = new THREE.Matrix4();
    matrix.setPosition(
        x * BLOCK_SIZE - WORLD_SIZE_X / 2 * BLOCK_SIZE + BLOCK_SIZE / 2,
        y * BLOCK_SIZE + BLOCK_SIZE / 2,
        z * BLOCK_SIZE - WORLD_SIZE_Z / 2 * BLOCK_SIZE + BLOCK_SIZE / 2
    );

    const instanceIndex = counts[type];
    mesh.setMatrixAt(instanceIndex, matrix);
    mesh.instanceMatrix.needsUpdate = true;

    counts[type]++;
    world[key] = type; // 记录方块位置和类型
}

// 创建一棵树
function createTree(x, y, z, counts) {
    const height = Math.floor(Math.random() * 3) + 4; // 树干高度 [4, 6]
    const leafRadius = 2; // 树冠半径

    // 创建树干
    for (let i = 0; i < height; i++) {
        addBlockInstance(x, y + i, z, 'wood', counts);
    }

    // 创建树冠 (简单方形/十字形)
    const topY = y + height;
    for (let ly = topY - 2; ly <= topY + 1; ly++) { // 树叶垂直范围
        for (let lx = x - leafRadius; lx <= x + leafRadius; lx++) {
            for (let lz = z - leafRadius; lz <= z + leafRadius; lz++) {
                // 计算到树干顶部的曼哈顿距离
                const dist = Math.abs(lx - x) + Math.abs(lz - z) + Math.abs(ly - (topY));
                // 简单的树叶形状逻辑：越靠近中心且在合理范围内越可能生成
                if (dist <= leafRadius + 1 && !(lx === x && lz === z && ly < topY)) { // 不在树干位置生成叶子 (除非在顶部正上方)
                    // 随机性：不是所有位置都生成
                    if (Math.random() > 0.2) { // 80% 概率生成
                        addBlockInstance(lx, ly, lz, 'leaves', counts);
                    }
                }
            }
        }
    }
    // 树顶再加一点
    addBlockInstance(x, topY + 1, z, 'leaves', counts);
    addBlockInstance(x + 1, topY, z, 'leaves', counts);
    addBlockInstance(x - 1, topY, z, 'leaves', counts);
    addBlockInstance(x, topY, z + 1, 'leaves', counts);
    addBlockInstance(x, topY, z - 1, 'leaves', counts);
}


// --- 动画循环 ---
function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    // 只在 PointerLock 激活时处理移动和物理
    if (controls.isLocked === true) {
        handleMovement(delta);
        applyPhysics(delta);
    }

    renderer.render(scene, camera);
}

// --- 处理移动 ---
function handleMovement(delta) {
    // 减速
    velocity.x -= velocity.x * 10.0 * delta;
    velocity.z -= velocity.z * 10.0 * delta;

    direction.z = Number(moveForward) - Number(moveBackward);
    direction.x = Number(moveRight) - Number(moveLeft);
    direction.normalize(); // 确保一致的速度

    if (moveForward || moveBackward) velocity.z -= direction.z * PLAYER_SPEED * delta * 10; // 调整因子使移动感觉更灵敏
    if (moveLeft || moveRight) velocity.x -= direction.x * PLAYER_SPEED * delta * 10;

    // 应用移动 (相对于相机方向)
    controls.moveRight(-velocity.x * delta);
    controls.moveForward(-velocity.z * delta);
}

// --- 应用物理和碰撞 ---
function applyPhysics(delta) {
    // 应用重力
    velocity.y += GRAVITY * delta;

    // 简单的地面碰撞检测
    const playerFeetY = controls.getObject().position.y - PLAYER_HEIGHT;
    const feetBlockX = Math.floor(controls.getObject().position.x / BLOCK_SIZE + WORLD_SIZE_X / 2);
    const feetBlockZ = Math.floor(controls.getObject().position.z / BLOCK_SIZE + WORLD_SIZE_Z / 2);
    // 向下检查一个方块
    const feetBlockY = Math.floor((playerFeetY - 0.1) / BLOCK_SIZE); // 稍微向下偏移一点检查

    const groundKey = `${feetBlockX},${feetBlockY},${feetBlockZ}`;
    const blockBelow = world[groundKey];

    // 检查是否在方块上
    if (blockBelow && playerFeetY <= (feetBlockY + 1) * BLOCK_SIZE) {
        if (velocity.y < 0) { // 只有在下落时才停止
            velocity.y = 0;
            controls.getObject().position.y = (feetBlockY + 1) * BLOCK_SIZE + PLAYER_HEIGHT;
            canJump = true;
        }
    } else {
        // 如果脚下没有方块，则不能跳跃（除非已经在空中）
        // canJump = false; // 这一行如果加上，则只能在地面跳，不能在空中连续跳（更真实）
    }

    // 应用垂直速度
    controls.getObject().position.y += velocity.y * delta;

    // 防止掉出世界底部 (可选)
    if (controls.getObject().position.y < -50) {
        teleportPlayerToSpawn();
    }
    // TODO: 添加左右和前后的碰撞检测会更复杂
}

function teleportPlayerToSpawn() {
    camera.position.set(WORLD_SIZE_X / 2, GROUND_Y + PLAYER_HEIGHT + 5, WORLD_SIZE_Z / 2); // 传送到空中一点的位置
    velocity.set(0, 0, 0);
    canJump = false;
}


// --- 事件处理 ---
function onKeyDown(event) {
    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
            moveForward = true;
            break;
        case 'ArrowLeft':
        case 'KeyA':
            moveLeft = true;
            break;
        case 'ArrowDown':
        case 'KeyS':
            moveBackward = true;
            break;
        case 'ArrowRight':
        case 'KeyD':
            moveRight = true;
            break;
        case 'Space':
            if (canJump === true) velocity.y = JUMP_VELOCITY;
            canJump = false; // 跳跃后设置为 false，直到落地
            break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
            moveForward = false;
            break;
        case 'ArrowLeft':
        case 'KeyA':
            moveLeft = false;
            break;
        case 'ArrowDown':
        case 'KeyS':
            moveBackward = false;
            break;
        case 'ArrowRight':
        case 'KeyD':
            moveRight = false;
            break;
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
