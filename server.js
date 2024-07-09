const express = require('express');
const fs = require('fs');
const app = express();
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt-nodejs');

const PORT = 3000;

const SECRET_KEY = fs.readFileSync('/Users/stanislau/private.key', 'utf8');
const publicKey = fs.readFileSync('/Users/stanislau/public.key', 'utf8');

const corsOptions = {
    origin: "http://localhost:4200",
    optionsSuccessStatus: 204,
    methods: "GET, POST, PUT, DELETE",
};


app.use(cors(corsOptions));
app.use(bodyParser.json());


// Load data from JSON files
const loadData = (file) => {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
};

// Save data to JSON files
const saveData = (file, data) => {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
};

// File paths
const ingredientsFile = './ingredients.json';
const recipesFile = './recipes.json';
const mealFile = './meal.json';
const usersFile = './user.json';

// Load initial data
let ingredients = loadData(ingredientsFile);
let recipes = loadData(recipesFile);
let meals = loadData(mealFile);
let users = loadData(usersFile);


// Signup method
app.post('/signup', (req, res) => {
    const { email, password, username } = req.body;
    bcrypt.hash(password, null, null, (err, hashedPassword) => {
        if (err) {
            return res.status(500).json({ error: 'Error hashing password' });
        }
        const newUser = {
            id: Math.floor(Math.random() * 1000) + users.length,
            email,
            password: hashedPassword,
            username,
            calorieGoal: 0,
            role: 'user'
        }

        users.push(newUser);
        saveData(usersFile, users);

        const token = jwt.sign({ id: newUser.id }, SECRET_KEY, {
            algorithm: 'RS256',
        });
        res.json({ token, expiresIn: 1200 });
    });
});

// Login method
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const user = users.find(u => u.email === email);

    if (!user) {
        return res.status(401).json({ error: 'Invalid username or password' });
    }

    bcrypt.compare(password, user.password, (err, match) => {
        if (err) {
            return res.status(500).json({ error: 'Error comparing passwords' });
        }

        if (!match) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }
        const token = jwt.sign({ id: user.id }, SECRET_KEY, {
            algorithm: 'RS256',
        });
        res.json({ token, expiresIn: 1200 });
    });
});

// JWT verification
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, publicKey, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// User fetching
app.get('/user', authenticateToken, (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    const { id } = jwt.verify(token, publicKey);
    const user = users.find(u => u.id === id);
    res.json(user);
});

app.put('/user', (req, res) => {
    const { calories } = req.body;

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    const { id } = jwt.verify(token, publicKey);

    const user = users.find(u => u.id === id);
    user.calorieGoal = calories
    saveData(usersFile, users);
    res.json(user.calorieGoal);
});

app.put('/subscribe', authenticateToken, (req, res) => {
    const { subscription } = req.body;
    console.log(subscription)

    const userID = req.user.id;
    const user = users.find(u => u.id === userID);
    user.subscription = subscription;
    user.role = 'subscribed';
    saveData(usersFile, users);
    console.log(user)
    res.json(user.subscription);
})

// CRUD operations for meal
app.get('/meal', authenticateToken, (req, res) => {
    const userID = req.user.id;
    const userMeals = meals.filter(meal => meal && meal.userID === userID);
    res.json(userMeals);
});

// Add or update a recipe in the meal at the index determined by the recipe's section
app.post('/meal', authenticateToken, (req, res) => {
    const { recipe, section } = req.body;
    const userID = req.user.id;

    if (section < 0 || section > 2) {
        res.status(400).json({ message: 'Invalid section' });
        return;
    }

    const newRecipe = { ...recipe, userID };
    console.log(newRecipe)

    meals[section] = newRecipe;
    saveData(mealFile, meals);
    res.status(200).json(newRecipe);
});

// Delete a recipe from the meal by recipe ID
app.delete('/meal/:recipeId', authenticateToken, (req, res) => {
    const { recipeId } = req.params;
    const userID = req.user.id; // Extract userID from authenticated user

    const recipeIndex = meals.findIndex(meal => meal && meal.id === +recipeId && meal.userID === userID);

    if (recipeIndex !== -1) {
        meals[recipeIndex] = null;
        saveData(mealFile, meals);
        res.status(204).send();
    } else {
        res.status(404).json({ message: 'Recipe not found' });
    }
});

// CRUD operations for ingredients
app.get('/ingredients', authenticateToken, (req, res) => {
    const query = req.query.q;
    const userID = req.user.id;

    if (query) {
        const filteredIngredients = ingredients.filter(ingredient =>
            ingredient.name.toLowerCase().includes(query.toLowerCase()) && ingredient.userID === userID
        );
        res.json(filteredIngredients);
    } else {
        const userIngredients = ingredients.filter(ing => ing.userID === userID);
        res.json(userIngredients);
    }
});

app.get('/ingredients/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const userID = req.user.id;

    const ingredient = ingredients.find(ingredient => ingredient.id === parseInt(id) && ingredient.userID === userID);

    if (ingredient) {
        res.json(ingredient);
    } else {
        res.status(404).json({ error: 'Ingredient not found' });
    }
});

app.post('/ingredients', authenticateToken, (req, res) => {
    const ingredient = req.body;
    const userID = req.user.id;

    const newIngredient = { ...ingredient, userID };

    ingredients.push(newIngredient);
    saveData(ingredientsFile, ingredients);
    res.status(201).json(newIngredient);
});

app.put('/ingredients/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const userID = req.user.id;

    const updatedIngredient = { ...req.body, userID };
    ingredients = ingredients.map(ing => ing.id === +id && ing.userID === userID ? updatedIngredient : ing);
    saveData(ingredientsFile, ingredients);
    res.json(updatedIngredient);
});

app.delete('/ingredients/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    ingredients = ingredients.filter(ing => !(ing.id === +id && ing.userID === userID));
    saveData(ingredientsFile, ingredients);
    res.status(204).send();
});

// CRUD operations for recipes
app.get('/recipes', (req, res) => {
    const { q, page = 1, itemsPerPage = 6, filters = [] } = req.query;
    let currentPage = page;

    let filteredRecipes = recipes;
    if (q) {
        currentPage = 1;
        const query = q.toLowerCase();
        filteredRecipes = recipes.filter(recipe =>
            recipe.title.toLowerCase().includes(query)
        );
    }

    if (filters) {
        filteredRecipes = filteredRecipes.filter(recipe => filters.includes(recipe.section));
    }

    // Pagination
    const totalItems = filteredRecipes.length;
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = currentPage * itemsPerPage;
    const paginatedRecipes = filteredRecipes.slice(startIndex, endIndex);
    res.json({ items: paginatedRecipes, totalItems, currentPage: currentPage });
});

app.get('/recipes/:id', (req, res) => {
    const { id } = req.params;
    const recipe = recipes.find(rec => rec.id === parseInt(id));

    if (recipe) {
        res.json(recipe);
    } else {
        res.status(404).json({ error: 'Recipe not found' });
    }
});

app.post('/recipes', authenticateToken, (req, res) => {
    const newRecipe = req.body;
    recipes.push(newRecipe);
    saveData(recipesFile, recipes);
    res.status(201).json(newRecipe);
});

app.put('/recipes/:id', (req, res) => {
    const { id } = req.params;
    const updatedRecipe = req.body;
    recipes = recipes.map(rec => rec.id === parseInt(id) ? updatedRecipe : rec);
    saveData(recipesFile, recipes);
    res.json(updatedRecipe);
});

app.delete('/recipes/:id', (req, res) => {
    const { id } = req.params;
    recipes = recipes.filter(rec => rec.id !== parseInt(id));
    saveData(recipesFile, recipes);
    res.status(204).send();
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});