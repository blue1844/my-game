function preload() {
    // No assets to load for this game
}

const MAP_WIDTH = 2400;
const MAP_HEIGHT = 1800;

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: 'game-container',
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

let game;

// Game state
let gameState = {
    playerShip: null,
    treasures: null,
    enemies: null,
    cannonballs: null,
    powerups: null,
    boss: null,
    bossGroup: null,
    
    score: 0,
    health: 100,
    level: 1,
    
    cannonCooldown: 0,
    enemySpawnTimer: 0,
    bossSpawnTimer: 0,
    
    rapidFireActive: false,
    rapidFireTimer: 0,
    
    chargeLevel: 0,
    maxCharge: 100,
    isCharging: false,
    isMouseCharging: false,
    isPaused: false,
    
    // Aiming
    shipRotation: 0,
    
    // DOM caching
    treasureUI: null,
    healthUI: null,
    levelUI: null,
    powerupUI: null,
    bossHealthUI: null,
    pauseText: null
};

function startGame() {
    game = new Phaser.Game(config);
}

window.startGame = startGame;

function create() {
    let createStage = 'start';
    try {
        createStage = 'cache-dom';
        gameState.treasureUI = document.getElementById('treasure');
        gameState.healthUI = document.getElementById('health');
        gameState.levelUI = document.getElementById('level');
        gameState.powerupUI = document.getElementById('powerup-status');
        gameState.bossHealthUI = document.getElementById('boss-health');

        createStage = 'background';
        this.add.rectangle(MAP_WIDTH / 2, MAP_HEIGHT / 2, MAP_WIDTH, MAP_HEIGHT, 0x1a5f7a);

        // Create decorative water pattern across the larger world
        for (let i = 0; i < MAP_WIDTH / 80; i++) {
            for (let j = 0; j < MAP_HEIGHT / 75; j++) {
                this.add.circle(i * 80, j * 75, 3, 0x0d3f4f).setAlpha(0.3);
            }
        }

        this.physics.world.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
        this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // Create player ship with pirate styling
    gameState.playerShip = createPirateShip(this, 100, 300);
    gameState.playerShip.setScale(1.4);
    this.physics.world.enable(gameState.playerShip);
    gameState.playerShip.body.setCollideWorldBounds(true);
    gameState.playerShip.body.setBounce(0.2);
    gameState.playerShip.body.setMaxVelocity(300, 300);
    gameState.playerShip.body.setSize(80, 60);
    gameState.playerShip.body.setOffset(-40, -30);
    gameState.playerShip.rotation = 0;
    gameState.playerShip.health = 100;
    this.cameras.main.startFollow(gameState.playerShip, true, 0.08, 0.08);

    gameState.wakeTrail = this.add.group();
    gameState.wakeTimer = 0;
    gameState.hintText = this.add.text(400, 570, '', {
        fontSize: '14px',
        fill: '#FFFFFF',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        padding: { x: 8, y: 6 }
    }).setScrollFactor(0).setOrigin(0.5);
    gameState.islandCenters = [];

    // Create sprite groups
    gameState.treasures = this.physics.add.group();
    gameState.powerups = this.physics.add.group();
    gameState.enemies = this.physics.add.group();
    gameState.cannonballs = this.physics.add.group();
    gameState.bossGroup = this.physics.add.group();
    gameState.islands = this.add.group();

    gameState.pauseText = this.add.text(400, 300, 'PAUSED', {
        fontSize: '36px',
        fill: '#ffffff',
        backgroundColor: 'rgba(0,0,0,0.6)',
        padding: { x: 10, y: 8 }
    }).setOrigin(0.5).setDepth(1000).setVisible(false);

    // Create islands and island treasure
    createIslands(this);

    // Spawn additional random treasures across the map
    for (let i = 0; i < 5; i++) {
        spawnTreasure(this);
    }

    // Setup input
    let cursors = this.input.keyboard.createCursorKeys();
    let wasd = this.input.keyboard.addKeys('W,A,S,D');
    
    // Store movement keys in gameState for update
    gameState.cursors = cursors;
    gameState.wasd = wasd;
    gameState.scene = this;

    // Input callbacks
    this.input.keyboard.on('keydown-SPACE', () => {
        if (gameState.isMouseCharging && gameState.chargeLevel > 0) {
            let pointer = this.input.activePointer;
            let worldX = pointer.worldX !== undefined ? pointer.worldX : this.cameras.main.getWorldPoint(pointer.x, pointer.y).x;
            let worldY = pointer.worldY !== undefined ? pointer.worldY : this.cameras.main.getWorldPoint(pointer.x, pointer.y).y;
            gameState.shipRotation = Phaser.Math.Angle.Between(gameState.playerShip.x, gameState.playerShip.y, worldX, worldY);
            fireCannon(this);
            gameState.chargeLevel = 0;
            gameState.isMouseCharging = false;
            return;
        }

        gameState.isCharging = true;
        gameState.chargeLevel = 0;
    });
    
    this.input.keyboard.on('keyup-SPACE', () => {
        if (gameState.isCharging || gameState.isMouseCharging) {
            let pointer = this.input.activePointer;
            let worldX = pointer.worldX !== undefined ? pointer.worldX : this.cameras.main.getWorldPoint(pointer.x, pointer.y).x;
            let worldY = pointer.worldY !== undefined ? pointer.worldY : this.cameras.main.getWorldPoint(pointer.x, pointer.y).y;
            gameState.shipRotation = Phaser.Math.Angle.Between(gameState.playerShip.x, gameState.playerShip.y, worldX, worldY);
            fireCannon(this);
        }
        gameState.isCharging = false;
        gameState.chargeLevel = 0;
    });

    // Pause toggle
    this.input.keyboard.on('keydown-P', () => {
        console.log('P pressed, toggling pause');
        gameState.isPaused = !gameState.isPaused;
        if (gameState.isPaused) {
            this.physics.world.pause();
            gameState.pauseText.setVisible(true);
        } else {
            this.physics.world.resume();
            gameState.pauseText.setVisible(false);
        }
    });

    // Resume from any key when paused (fallback)
    this.input.keyboard.on('keydown', () => {
        if (gameState.isPaused) {
            gameState.isPaused = false;
            this.physics.world.resume();
            gameState.pauseText.setVisible(false);
        }
    });

    // Restart game
    this.input.keyboard.on('keydown-R', () => {
        gameState.scene.scene.restart();
    });

    // Mouse aim + charge (hold mouse and press space to fire)
    this.input.on('pointerdown', pointer => {
        if (pointer.leftButtonDown()) {
            gameState.isMouseCharging = true;
            gameState.chargeLevel = 0;
            let worldX = pointer.worldX !== undefined ? pointer.worldX : this.cameras.main.getWorldPoint(pointer.x, pointer.y).x;
            let worldY = pointer.worldY !== undefined ? pointer.worldY : this.cameras.main.getWorldPoint(pointer.x, pointer.y).y;
            gameState.shipRotation = Phaser.Math.Angle.Between(gameState.playerShip.x, gameState.playerShip.y, worldX, worldY);
        }
    });

    this.input.on('pointerup', pointer => {
        if (!pointer.leftButtonDown()) {
            gameState.isMouseCharging = false;
        }
    });

    this.input.on('pointermove', pointer => {
        if (gameState.playerShip && gameState.playerShip.active) {
            let worldX = pointer.worldX !== undefined ? pointer.worldX : this.cameras.main.getWorldPoint(pointer.x, pointer.y).x;
            let worldY = pointer.worldY !== undefined ? pointer.worldY : this.cameras.main.getWorldPoint(pointer.x, pointer.y).y;
            gameState.shipRotation = Phaser.Math.Angle.Between(gameState.playerShip.x, gameState.playerShip.y, worldX, worldY);
        }
    });

    this.input.on('pointerdown', pointer => {
        if (gameState.playerShip && gameState.playerShip.active) {
            let worldX = pointer.worldX !== undefined ? pointer.worldX : this.cameras.main.getWorldPoint(pointer.x, pointer.y).x;
            let worldY = pointer.worldY !== undefined ? pointer.worldY : this.cameras.main.getWorldPoint(pointer.x, pointer.y).y;
            gameState.shipRotation = Phaser.Math.Angle.Between(gameState.playerShip.x, gameState.playerShip.y, worldX, worldY);
            fireCannon(this);
        }
    });

    // Collisions
    let that = this;
    this.physics.add.overlap(gameState.playerShip, gameState.treasures, (ship, treasure) => {
        if (treasure.active) {
            gameState.score += 10;
            treasure.destroy();
            if (gameState.score % 50 === 0) gameState.level++;
        }
    });

    this.physics.add.overlap(gameState.playerShip, gameState.enemies, (ship, enemy) => {
        if (enemy.active) {
            ship.health -= 10;
            let angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, ship.x, ship.y);
            ship.body.setVelocity(Math.cos(angle) * 200, Math.sin(angle) * 200);
            enemy.destroy();
        }
    });

    this.physics.add.overlap(gameState.playerShip, gameState.powerups, (ship, powerup) => {
        if (powerup.active) {
            collectPowerup(ship, powerup, this);
        }
    });

    this.physics.add.overlap(gameState.playerShip, gameState.bossGroup, (ship, boss) => {
        if (boss && boss.active) {
            ship.health -= 15;
            let angle = Phaser.Math.Angle.Between(boss.x, boss.y, ship.x, ship.y);
            ship.body.setVelocity(Math.cos(angle) * 250, Math.sin(angle) * 250);
        }
    });

    this.physics.add.overlap(gameState.cannonballs, gameState.enemies, (ball, enemy) => {
        if (ball.active && enemy.active) {
            let damage = ball.damage || 25;
            ball.destroy();
            enemy.health = Math.max(0, enemy.health - damage);
            if (enemy.health <= 0) {
                gameState.score += 25;
                enemy.destroy();
            } else {
                // hit feedback
                enemy.setTint(0xFFFFFF);
                that.time.delayedCall(80, () => {
                    if (enemy && enemy.active) enemy.clearTint();
                });
            }
        }
    });

    this.physics.add.overlap(gameState.cannonballs, gameState.bossGroup, (ball, boss) => {
        if (ball.active && boss && boss.active) {
            let damage = ball.damage || 15;
            ball.destroy();
            boss.health = Math.max(0, boss.health - damage);
            gameState.score += 10;
            boss.setFillStyle(0xFFFFFF);
            that.time.delayedCall(100, () => {
                if (boss && boss.active) boss.setFillStyle(0xFF1111);
            });

            if (boss.health <= 0) {
                boss.destroy();
                gameState.boss = null;
                gameState.score += 100;
                gameState.level += 2;
                gameState.bossSpawnTimer = 0;
            }
        }
    });

    this.physics.add.collider(gameState.enemies, gameState.enemies);
} catch (err) {
    console.error('Game.create error', err);
    let errText = this.add.text(400, 300, 'ERROR: ' + (err.message || err), {
        fontSize: '18px',
        fill: '#ff0000',
        backgroundColor: 'rgba(0,0,0,0.8)',
        padding: { x: 10, y: 10 }
    }).setOrigin(0.5).setDepth(1000);
}
}

function update() {
    if (!gameState.playerShip || !gameState.playerShip.active) {
        return;
    }

    if (gameState.isPaused) {
        return;
    }

    // Charge handling (keyboard or mouse hold)
    if ((gameState.isCharging || gameState.isMouseCharging) && gameState.chargeLevel < gameState.maxCharge) {
        gameState.chargeLevel += 2;
    }

    // Player movement (WASD only)
    let accelerationX = 0;
    let accelerationY = 0;

    // WASD for movement
    if (gameState.wasd.W.isDown) {
        accelerationY = -300;
    }
    if (gameState.wasd.S.isDown) {
        accelerationY = 300;
    }
    if (gameState.wasd.A.isDown) {
        accelerationX = -300;
    }
    if (gameState.wasd.D.isDown) {
        accelerationX = 300;
    }

    gameState.playerShip.body.setVelocity(accelerationX, accelerationY);

    // Mouse aim is always active (prefers pixel-accurate mouse target)
    if (gameState.scene.input.activePointer && gameState.playerShip.active) {
        let pointer = gameState.scene.input.activePointer;
        let worldPoint = gameState.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
        if (worldPoint.x !== undefined && worldPoint.y !== undefined) {
            gameState.shipRotation = Phaser.Math.Angle.Between(gameState.playerShip.x, gameState.playerShip.y, worldPoint.x, worldPoint.y);
        }
    }

    // Arrow keys control aiming/rotation (keyboard overrides when pressed)
    let rotationSpeed = 0.15;
    if (gameState.cursors.left.isDown) {
        gameState.shipRotation -= rotationSpeed;
    }
    if (gameState.cursors.right.isDown) {
        gameState.shipRotation += rotationSpeed;
    }
    if (gameState.cursors.up.isDown) {
        gameState.shipRotation = -Math.PI / 2; // Point up
    }
    if (gameState.cursors.down.isDown) {
        gameState.shipRotation = Math.PI / 2; // Point down
    }
    
    gameState.playerShip.rotation = gameState.shipRotation;

    // Cooldowns
    if (gameState.cannonCooldown > 0) gameState.cannonCooldown--;
    
    if (gameState.rapidFireActive) {
        gameState.rapidFireTimer--;
        if (gameState.rapidFireTimer <= 0) {
            gameState.rapidFireActive = false;
        } else if (gameState.cannonCooldown <= 0) {
            fireCannonInternal(gameState.scene);
            gameState.cannonCooldown = 15;
        }
    }

    // Enemy spawning
    gameState.enemySpawnTimer++;
    if (gameState.enemySpawnTimer > 120) {
        if (gameState.enemies.children.entries.length < 3 + gameState.level) {
            spawnEnemy(gameState.scene);
        }
        gameState.enemySpawnTimer = 0;
    }

    // Move enemies
    gameState.enemies.children.entries.forEach(enemy => {
        if (enemy.active) {
            let angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, gameState.playerShip.x, gameState.playerShip.y);
            enemy.rotation = angle;
            enemy.body.setVelocity(Math.cos(angle) * 100, Math.sin(angle) * 100);

            if (enemy.x < -50 || enemy.x > MAP_WIDTH + 50 || enemy.y < -50 || enemy.y > MAP_HEIGHT + 50) {
                enemy.destroy();
            }
        }
    });

    // Clean up cannonballs (increased lifetime - was 50 pixels, now 100+)
    gameState.cannonballs.children.entries.forEach(ball => {
        if (!ball.active) return;

        // Keep bullets moving with fixed travel velocity in case arcade drag or body updates change it.
        if (ball.vx !== undefined && ball.vy !== undefined) {
            ball.body.setVelocity(ball.vx, ball.vy);
        }

        if (ball.x < -200 || ball.x > MAP_WIDTH + 200 || ball.y < -200 || ball.y > MAP_HEIGHT + 200) {
            ball.destroy();
        }
    });

    // Regenerate treasures
    if (gameState.treasures.children.entries.length < 3) {
        spawnTreasure(gameState.scene);
    }

    // Spawn power-ups (rare)
    if (gameState.powerups.children.entries.length < 2 && Math.random() < 0.002) {
        spawnPowerup(gameState.scene);
    }

    // Ship wake trail
    if (gameState.playerShip && gameState.playerShip.active) {
        let velocity = gameState.playerShip.body ? gameState.playerShip.body.velocity : { x: 0, y: 0 };
        if (Math.abs(velocity.x) > 20 || Math.abs(velocity.y) > 20) {
            gameState.wakeTimer++;
            if (gameState.wakeTimer % 8 === 0) {
                createWakePulse(gameState.scene);
            }
        }
    }

    // Boss spawning (only after level 4 and score 250+, waits 10 seconds)
    gameState.bossSpawnTimer++;
    if (!gameState.boss && gameState.level >= 4 && gameState.score >= 250 && gameState.bossSpawnTimer > 600) {
        spawnBoss(gameState.scene);
        gameState.bossSpawnTimer = 0;
    }

    // Update boss
    if (gameState.boss && gameState.boss.active) {
        let angle = Phaser.Math.Angle.Between(gameState.boss.x, gameState.boss.y, gameState.playerShip.x, gameState.playerShip.y);
        gameState.boss.rotation = angle;
        gameState.boss.body.setVelocity(Math.cos(angle) * 80, Math.sin(angle) * 80);

        if (!gameState.boss.fireCounter) gameState.boss.fireCounter = 80;
        gameState.boss.fireCounter--;
        if (gameState.boss.fireCounter <= 0) {
            fireBossCannonball(gameState.scene);
            gameState.boss.fireCounter = 80;
        }

        if (gameState.boss.isKraken && gameState.boss.tentacles) {
            gameState.boss.tentacles.forEach((tentacle, index) => {
                tentacle.rotation = Math.sin((gameState.scene.time.now / 300) + index * 0.8) * 0.35;
            });
        }

        if (gameState.boss.x < -50 || gameState.boss.x > MAP_WIDTH + 50 || gameState.boss.y < -50 || gameState.boss.y > MAP_HEIGHT + 50) {
            gameState.boss.destroy();
            gameState.boss = null;
        }
    }

    // Update UI (once per frame is ok) - defensive (avoid null DOM references)
    if (gameState.treasureUI) gameState.treasureUI.textContent = gameState.score;
    if (gameState.healthUI) gameState.healthUI.textContent = gameState.playerShip.health;
    if (gameState.levelUI) gameState.levelUI.textContent = gameState.level;

    if (gameState.bossHealthUI) {
        gameState.bossHealthUI.textContent = (gameState.boss && gameState.boss.active) ? gameState.boss.health : 'N/A';
    }
    
    let powerupText = '';
    if (gameState.rapidFireActive) powerupText += '🔥 Rapid Fire ';
    if (gameState.chargeLevel > 0) powerupText += `⚡ ${Math.floor(gameState.chargeLevel)}%`;
    gameState.powerupUI.textContent = powerupText;

    updateTreasureHint();

    // Game over
    if (gameState.playerShip.health <= 0) {
        gameState.scene.physics.pause();
        if (!gameState.gameOverText) {
            gameState.gameOverText = gameState.scene.add.text(400, 300, `Game Over\nScore: ${gameState.score}\nLevel: ${gameState.level}`, {
                fontSize: '24px',
                fill: '#ff4444',
                backgroundColor: 'rgba(0, 0, 0, 0.85)',
                padding: { x: 12, y: 10 }
            }).setOrigin(0.5).setDepth(1000).setScrollFactor(0);
        }
        gameState.playerShip.setActive(false);
        gameState.scene.time.delayedCall(1200, () => {
            gameState.scene.scene.restart();
        });
        return;
    }
}

function spawnTreasure(scene) {
    let x = Phaser.Math.Between(50, MAP_WIDTH - 50);
    let y = Phaser.Math.Between(50, MAP_HEIGHT - 50);
    let treasure = scene.add.star(x, y, 5, 8, 15, 0xFFD700);
    scene.physics.world.enable(treasure);
    gameState.treasures.add(treasure);
}

function createIslands(scene) {
    let islandPositions = [
        { x: 400, y: 400, size: 90 },
        { x: 1200, y: 300, size: 110 },
        { x: 1900, y: 500, size: 80 },
        { x: 700, y: 1300, size: 100 },
        { x: 1600, y: 1400, size: 120 }
    ];

    islandPositions.forEach(data => {
        createIsland(scene, data.x, data.y, data.size);
    });
}

function createIsland(scene, x, y, radius) {
    let sand = scene.add.ellipse(x, y + 10, radius * 2.2, radius * 1.1, 0xDEB887).setAlpha(0.75);
    let island = scene.add.circle(x, y, radius, 0x8B5A2B).setStrokeStyle(4, 0xC19A6B);
    let grass = scene.add.circle(x, y - radius * 0.25, radius * 0.45, 0x2E8B57).setAlpha(0.9);
    gameState.islands.add(sand);
    gameState.islands.add(island);
    gameState.islands.add(grass);
    gameState.islandCenters.push({ x, y });

    // Add palm trees on the island
    createPalmTree(scene, x - radius * 0.4, y - radius * 0.3);
    createPalmTree(scene, x + radius * 0.35, y - radius * 0.45);

    // Place a few gold treasures on the island
    let pieces = Phaser.Math.Between(2, 4);
    for (let i = 0; i < pieces; i++) {
        let angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
        let dist = Phaser.Math.Between(20, radius - 30);
        let tx = x + Math.cos(angle) * dist;
        let ty = y + Math.sin(angle) * dist;
        let treasure = scene.add.star(tx, ty, 5, 8, 15, 0xFFD700);
        scene.physics.world.enable(treasure);
        gameState.treasures.add(treasure);
    }
}

function createPalmTree(scene, x, y) {
    let trunk = scene.add.rectangle(x, y + 12, 10, 40, 0x8B4513).setOrigin(0.5, 0);
    let leaves = scene.add.circle(x, y - 8, 22, 0x228B22).setAlpha(0.95);
    let leaves2 = scene.add.circle(x - 14, y + 6, 16, 0x228B22).setAlpha(0.95);
    let leaves3 = scene.add.circle(x + 14, y + 6, 16, 0x228B22).setAlpha(0.95);
    scene.add.circle(x, y + 20, 8, 0xDEB887).setAlpha(0.8);
}

function createWakePulse(scene) {
    if (!gameState.playerShip || !gameState.playerShip.active) return;
    let angle = gameState.shipRotation + Math.PI;
    let x = gameState.playerShip.x + Math.cos(angle) * 30;
    let y = gameState.playerShip.y + Math.sin(angle) * 30;
    let bubble = scene.add.circle(x, y, 6, 0xCFE8FF, 0.5);
    gameState.wakeTrail.add(bubble);
    scene.tweens.add({
        targets: bubble,
        alpha: 0,
        scale: 0.2,
        duration: 500,
        ease: 'Quad.easeOut',
        onComplete: () => bubble.destroy()
    });
}

function updateTreasureHint() {
    if (!gameState.hintText || !gameState.playerShip) return;
    let nearest = null;
    let nearestDist = Number.MAX_VALUE;
    gameState.islandCenters.forEach(item => {
        let d = Phaser.Math.Distance.Between(gameState.playerShip.x, gameState.playerShip.y, item.x, item.y);
        if (d < nearestDist) {
            nearestDist = d;
            nearest = item;
        }
    });

    if (nearest && nearestDist < 900) {
        let distanceText = Math.round(nearestDist);
        let alertText = nearestDist < 180 ? ' - treasure island close!' : '';
        gameState.hintText.text = `Nearest island: ${distanceText}m${alertText}`;
    } else {
        gameState.hintText.text = 'Explore the map to find island treasure!';
    }
}

function createPirateShip(scene, x, y) {
    let ship = scene.add.container(x, y);

    let hull = scene.add.polygon(0, 12, [ -36, 0, 36, 0, 24, 18, -24, 18 ], 0x8B4513).setStrokeStyle(2, 0x5C3317);
    let deck = scene.add.rectangle(0, 1, 60, 12, 0xA0522D).setOrigin(0.5, 0.5);
    let mast = scene.add.rectangle(0, -4, 8, 60, 0x4B3621).setOrigin(0.5, 1);
    let sail = scene.add.triangle(10, -28, 0, -12, 0, -52, 36, -30, 0xFFFFFF).setStrokeStyle(2, 0x999999).setAlpha(0.95);
    let flag = scene.add.triangle(24, -50, 0, -50, 0, -42, 24, -46, 0xFF0000);
    let cross = scene.add.line(-6, -40, -10, -6, 10, -6, 0x000000).setLineWidth(2).setOrigin(0.5, 0.5);

    ship.add([hull, deck, mast, sail, flag, cross]);
    ship.setSize(72, 64);

    return ship;
}

function spawnEnemy(scene) {
    let sides = ['top', 'bottom', 'left', 'right'];
    let side = Phaser.Math.RND.pick(sides);
    let x, y;

    if (side === 'top') {
        x = Phaser.Math.Between(50, MAP_WIDTH - 50);
        y = -20;
    } else if (side === 'bottom') {
        x = Phaser.Math.Between(50, MAP_WIDTH - 50);
        y = MAP_HEIGHT + 20;
    } else if (side === 'left') {
        x = -20;
        y = Phaser.Math.Between(50, MAP_HEIGHT - 50);
    } else {
        x = MAP_WIDTH + 20;
        y = Phaser.Math.Between(50, MAP_HEIGHT - 50);
    }

    let enemy = scene.add.circle(x, y, 12, 0xFF6B6B);
    scene.physics.world.enable(enemy);
    enemy.body.setCollideWorldBounds(true);
    enemy.body.setBounce(1);
    enemy.health = 20; // give enemy durability
    gameState.enemies.add(enemy);
}

function spawnPowerup(scene) {
    let x = Phaser.Math.Between(50, MAP_WIDTH - 50);
    let y = Phaser.Math.Between(50, MAP_HEIGHT - 50);
    let type = Phaser.Math.RND.pick(['health', 'rapid']);
    
    let colors = { health: 0x00FF00, rapid: 0xFFAA00 };
    
    let powerup = scene.add.rectangle(x, y, 20, 20, colors[type]);
    scene.physics.world.enable(powerup);
    powerup.type = type;
    gameState.powerups.add(powerup);
}

function collectPowerup(player, powerup, scene) {
    let type = powerup.type;
    powerup.destroy();
    
    switch(type) {
        case 'health':
            player.health = Math.min(player.health + 30, 100);
            gameState.score += 15;
            break;
        case 'rapid':
            gameState.rapidFireActive = true;
            gameState.rapidFireTimer = 180;
            gameState.score += 20;
            break;
    }
}

function createKuttyKraken(scene, x, y) {
    let boss = scene.add.container(x, y);
    let body = scene.add.circle(0, 0, 40, 0x3B0B0B).setStrokeStyle(4, 0x631414);
    let eyeLeft = scene.add.circle(-14, -10, 7, 0xFFFFFF);
    let eyeRight = scene.add.circle(14, -10, 7, 0xFFFFFF);
    let pupilLeft = scene.add.circle(-14, -10, 3, 0x000000);
    let pupilRight = scene.add.circle(14, -10, 3, 0x000000);
    let tentacles = [];
    let offsets = [ -32, -18, 0, 18, 32 ];
    offsets.forEach((offset, index) => {
        let t = scene.add.polygon(offset, 40, [0, 0, -10, 40, 10, 40], 0x5B1E1E).setAlpha(0.95);
        tentacles.push(t);
    });
    boss.add([body, eyeLeft, eyeRight, pupilLeft, pupilRight, ...tentacles]);
    scene.physics.world.enable(boss);
    boss.body.setCircle(40);
    boss.body.setOffset(-40, -40);
    boss.body.setCollideWorldBounds(true);
    boss.body.setBounce(0.5);
    boss.isKraken = true;
    boss.tentacles = tentacles;
    return boss;
}

function spawnBoss(scene) {
    let x = Phaser.Math.Between(200, MAP_WIDTH - 200);
    let y = Phaser.Math.Between(150, MAP_HEIGHT - 150);
    gameState.boss = createKuttyKraken(scene, x, y);
    gameState.boss.health = 450;
    gameState.boss.fireCounter = 80;
    gameState.bossGroup.add(gameState.boss);
}

function createCannonball(scene, x, y, radius, angle, speed, damage = 25) {
    let cannonball = scene.add.circle(x, y, radius, 0xFFFFFF);
    scene.physics.world.enable(cannonball);
    cannonball.body.setCircle(radius);
    cannonball.body.setAllowGravity(false);
    cannonball.body.setCollideWorldBounds(false);
    cannonball.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    cannonball.body.setDrag(0, 0);
    cannonball.vx = Math.cos(angle) * speed;
    cannonball.vy = Math.sin(angle) * speed;
    cannonball.damage = damage;
    return cannonball;
}

function fireCannonInternal(scene) {
    let angle = gameState.shipRotation;
    if (!Number.isFinite(angle)) angle = 0;
    let speed = 1000;
    
    // Spawn position
    let spawnX = gameState.playerShip.x + Math.cos(angle) * 30;
    let spawnY = gameState.playerShip.y + Math.sin(angle) * 30;
    
    // Create bullet (simple)
    let cannonball = createCannonball(scene, spawnX, spawnY, 5, angle, speed);
    gameState.cannonballs.add(cannonball);
}

function fireCannon(scene) {
    if (gameState.cannonCooldown > 0 && !gameState.rapidFireActive) return;
    
    let angle = gameState.shipRotation;
    if (!Number.isFinite(angle)) angle = 0;
    let speed = 1000 + (gameState.chargeLevel / gameState.maxCharge) * 400;
    let size = 5 + (gameState.chargeLevel / gameState.maxCharge) * 6;
    
    // Fire 3 bullets in spread
    for (let i = -1; i <= 1; i++) {
        let fireAngle = angle + (i * 0.2);
        let spawnX = gameState.playerShip.x + Math.cos(fireAngle) * 30;
        let spawnY = gameState.playerShip.y + Math.sin(fireAngle) * 30;
        
        // Create bullet
        let cannonball = createCannonball(scene, spawnX, spawnY, size, fireAngle, speed);
        gameState.cannonballs.add(cannonball);
    }
    
    gameState.cannonCooldown = 25;
}

function fireBossCannonball(scene) {
    if (!gameState.boss || !gameState.boss.active) return;
    
    let centerAngle = Phaser.Math.Angle.Between(gameState.boss.x, gameState.boss.y, gameState.playerShip.x, gameState.playerShip.y);
    let spread = 0.25;
    let speed = 380;

    for (let i = -1; i <= 1; i++) {
        let angle = centerAngle + i * spread;
        let spawnX = gameState.boss.x + Math.cos(angle) * 40;
        let spawnY = gameState.boss.y + Math.sin(angle) * 40;
        let bossBall = scene.add.circle(spawnX, spawnY, 6, 0xFF6666);
        scene.physics.world.enable(bossBall);
        let vx = Math.cos(angle) * speed;
        let vy = Math.sin(angle) * speed;
        bossBall.body.setVelocity(vx, vy);
        gameState.cannonballs.add(bossBall);
    }
}
