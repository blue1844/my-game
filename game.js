function preload() {
    // No assets to load for this game
}

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
        this.add.rectangle(400, 300, 800, 600, 0x1a5f7a);

        // Create decorative water pattern
        for (let i = 0; i < 10; i++) {
            for (let j = 0; j < 8; j++) {
                this.add.circle(i * 80, j * 75, 3, 0x0d3f4f).setAlpha(0.3);
            }
        }
    
    // Create decorative water pattern
    for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 8; j++) {
            this.add.circle(i * 80, j * 75, 3, 0x0d3f4f).setAlpha(0.3);
        }
    }

    // Create player ship (triangle)
    gameState.playerShip = this.add.triangle(100, 300, 0, -15, -12, 20, 12, 20, 0x8B4513);
    gameState.playerShip.setScale(2);
    this.physics.world.enable(gameState.playerShip);
    gameState.playerShip.body.setCollideWorldBounds(true);
    gameState.playerShip.body.setBounce(0.2);
    gameState.playerShip.body.setMaxVelocity(300, 300);
    gameState.playerShip.rotation = 0;
    gameState.playerShip.health = 100;

    // Create sprite groups
    gameState.treasures = this.physics.add.group();
    gameState.powerups = this.physics.add.group();
    gameState.enemies = this.physics.add.group();
    gameState.cannonballs = this.physics.add.group();
    gameState.bossGroup = this.physics.add.group();

    gameState.pauseText = this.add.text(400, 300, 'PAUSED', {
        fontSize: '36px',
        fill: '#ffffff',
        backgroundColor: 'rgba(0,0,0,0.6)',
        padding: { x: 10, y: 8 }
    }).setOrigin(0.5).setDepth(1000).setVisible(false);

    // Spawn initial treasures
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
            gameState.shipRotation = Phaser.Math.Angle.Between(gameState.playerShip.x, gameState.playerShip.y, this.input.activePointer.x, this.input.activePointer.y);
            fireCannon(this);
            gameState.chargeLevel = 0;
            gameState.isMouseCharging = false;
            return;
        }

        gameState.isCharging = true;
        gameState.chargeLevel = 0;
    });
    
    this.input.keyboard.on('keyup-SPACE', () => {
        if (gameState.isCharging && gameState.chargeLevel > 0) {
            gameState.shipRotation = Phaser.Math.Angle.Between(gameState.playerShip.x, gameState.playerShip.y, this.input.activePointer.x, this.input.activePointer.y);
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
            gameState.shipRotation = Phaser.Math.Angle.Between(gameState.playerShip.x, gameState.playerShip.y, pointer.x, pointer.y);
        }
    });

    this.input.on('pointerup', pointer => {
        if (!pointer.leftButtonDown()) {
            gameState.isMouseCharging = false;
        }
    });

    this.input.on('pointermove', pointer => {
        if (gameState.playerShip && gameState.playerShip.active) {
            gameState.shipRotation = Phaser.Math.Angle.Between(gameState.playerShip.x, gameState.playerShip.y, pointer.x, pointer.y);
        }
    });

    this.input.on('pointerdown', pointer => {
        if (gameState.playerShip && gameState.playerShip.active) {
            gameState.shipRotation = Phaser.Math.Angle.Between(gameState.playerShip.x, gameState.playerShip.y, pointer.x, pointer.y);
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
        if (pointer.x !== undefined && pointer.y !== undefined) {
            gameState.shipRotation = Phaser.Math.Angle.Between(gameState.playerShip.x, gameState.playerShip.y, pointer.x, pointer.y);
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

            if (enemy.x < -50 || enemy.x > 850 || enemy.y < -50 || enemy.y > 650) {
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

        if (ball.x < -200 || ball.x > 1000 || ball.y < -200 || ball.y > 800) {
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

    // Boss spawning (only after level 3 and score 150+, waits 10 seconds)
    gameState.bossSpawnTimer++;
    if (!gameState.boss && gameState.level >= 3 && gameState.score >= 150 && gameState.bossSpawnTimer > 600) {
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

        if (gameState.boss.x < -50 || gameState.boss.x > 850 || gameState.boss.y < -50 || gameState.boss.y > 650) {
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

    // Game over
    if (gameState.playerShip.health <= 0) {
        gameState.scene.physics.pause();
        alert(`Game Over!\nScore: ${gameState.score}\nLevel: ${gameState.level}`);
        gameState.scene.scene.restart();
    }
}

function spawnTreasure(scene) {
    let x = Phaser.Math.Between(50, 750);
    let y = Phaser.Math.Between(50, 550);
    let treasure = scene.add.star(x, y, 5, 8, 15, 0xFFD700);
    scene.physics.world.enable(treasure);
    gameState.treasures.add(treasure);
}

function spawnEnemy(scene) {
    let sides = ['top', 'bottom', 'left', 'right'];
    let side = Phaser.Math.RND.pick(sides);
    let x, y;

    if (side === 'top') {
        x = Phaser.Math.Between(50, 750);
        y = -20;
    } else if (side === 'bottom') {
        x = Phaser.Math.Between(50, 750);
        y = 620;
    } else if (side === 'left') {
        x = -20;
        y = Phaser.Math.Between(50, 550);
    } else {
        x = 820;
        y = Phaser.Math.Between(50, 550);
    }

    let enemy = scene.add.circle(x, y, 12, 0xFF6B6B);
    scene.physics.world.enable(enemy);
    enemy.body.setCollideWorldBounds(true);
    enemy.body.setBounce(1);
    enemy.health = 20; // give enemy durability
    gameState.enemies.add(enemy);
}

function spawnPowerup(scene) {
    let x = Phaser.Math.Between(50, 750);
    let y = Phaser.Math.Between(50, 550);
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

function spawnBoss(scene) {
    let x = Phaser.Math.Between(200, 600);
    let y = Phaser.Math.Between(100, 500);
    
    gameState.boss = scene.add.circle(x, y, 25, 0xFF1111);
    scene.physics.world.enable(gameState.boss);
    gameState.boss.body.setCollideWorldBounds(true);
    gameState.boss.body.setBounce(0.5);
    gameState.boss.setScale(1.5);
    gameState.boss.health = 300; // boss health, takes multiple hits
    gameState.boss.fireCounter = 80;

    gameState.bossGroup.add(gameState.boss);
}

function createCannonball(scene, spawnX, spawnY, radius, angle, speed, color = 0xFFFF00) {
    let cannonball = scene.add.circle(spawnX, spawnY, radius, color);
    scene.physics.add.existing(cannonball);

    cannonball.body.setCircle(radius);
    cannonball.body.setCollideWorldBounds(false);
    cannonball.body.setAllowGravity(false);
    cannonball.body.setDrag(0, 0);
    cannonball.body.setMaxVelocity(speed, speed);

    let vx = Math.cos(angle) * speed;
    let vy = Math.sin(angle) * speed;
    cannonball.body.setVelocity(vx, vy);
    cannonball.body.setBounce(0);

    cannonball.vx = vx;
    cannonball.vy = vy;
    cannonball.damage = 25;

    return cannonball;
}

function fireCannonInternal(scene) {
    let angle = gameState.shipRotation;
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
    
    let angle = Phaser.Math.Angle.Between(gameState.boss.x, gameState.boss.y, gameState.playerShip.x, gameState.playerShip.y);
    let spawnX = gameState.boss.x + Math.cos(angle) * 30;
    let spawnY = gameState.boss.y + Math.sin(angle) * 30;
    
    let bossBall = scene.add.circle(spawnX, spawnY, 6, 0xFF6666);
    scene.physics.world.enable(bossBall);
    
    let speed = 400;
    let vx = Math.cos(angle) * speed;
    let vy = Math.sin(angle) * speed;
    bossBall.body.setVelocity(vx, vy);
    
    gameState.cannonballs.add(bossBall);
}
