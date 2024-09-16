import React, { useState, useEffect } from 'react';
import * as Realm from 'realm-web';
import { openDB } from 'idb';

const REALM_APP_ID = 'application-1-qbwpyyy'; // Replace with your Realm App ID
const app = new Realm.App({ id: REALM_APP_ID });

const dbPromise = openDB('todo-db', 1, {
  upgrade(db) {
    db.createObjectStore('todos', { keyPath: 'id', autoIncrement: true });
  },
});

async function getTodos() {
  const db = await dbPromise;
  return db.getAll('todos');
}

async function addTodoOffline(todo) {
  const db = await dbPromise;
  await db.add('todos', todo);
}

async function editTodoOffline(updatedTodo) {
  const db = await dbPromise;
  await db.put('todos', updatedTodo);
}

async function deleteTodoOffline(todoId) {
  const db = await dbPromise;
  await db.delete('todos', todoId);
}

async function syncTodos(user) {
  const db = await dbPromise;
  const todos = await db.getAll('todos');
  const mongo = user.mongoClient('mongodb-atlas');
  const collection = mongo.db('todo-db').collection('todos');

  for (const todo of todos) {
    try {
      if (todo._id) {
        // Update existing todo in MongoDB
        await collection.updateOne(
          { _id: Realm.BSON.ObjectId(todo._id) },
          { $set: { text: todo.text, done: todo.done } }
        );
      } else {
        // Insert new todo into MongoDB
        const insertResult = await collection.insertOne({ text: todo.text, done: todo.done, userId: user.id });
        await db.delete('todos', todo.id);
        await db.put('todos', { ...todo, _id: insertResult.insertedId });
      }
    } catch (error) {
      console.error("Failed to sync todo:", error);
    }
  }
}

async function fetchTodosFromDB(user) {
  const mongo = user.mongoClient('mongodb-atlas');
  const collection = mongo.db('todo-db').collection('todos');
  return collection.find({ userId: user.id });
}

async function saveUserData(user) {
  const mongo = user.mongoClient('mongodb-atlas');
  const collection = mongo.db('todo-db').collection('users');

  try {
    await collection.insertOne({ userId: user.id, email: user.profile.email });
  } catch (error) {
    console.error("Failed to save user data:", error);
  }
}

function App() {
  const [todos, setTodos] = useState([]);
  const [todoText, setTodoText] = useState('');
  const [editTodoId, setEditTodoId] = useState(null);
  const [editTodoText, setEditTodoText] = useState('');
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (user) {
      getTodos().then(setTodos);
      fetchTodosFromDB(user).then(setTodos);
    }
  }, [user]);

  useEffect(() => {
    if (navigator.onLine && user) {
      syncTodos(user);
    }
  }, [navigator.onLine, user]);

  const handleAddTodo = async () => {
    const newTodo = { text: todoText, done: false };
    setTodos([...todos, newTodo]);
    setTodoText('');
    await addTodoOffline(newTodo);
    if (navigator.onLine && user) {
      await syncTodos(user);
    }
  };

  const handleEditButtonClick = (todoId, todoText) => {
    setEditTodoId(todoId);
    setEditTodoText(todoText);
  };

  const handleSaveEdit = async () => {
    const updatedTodos = todos.map(todo =>
      todo.id === editTodoId ? { ...todo, text: editTodoText } : todo
    );
    setTodos(updatedTodos);
    await editTodoOffline({ id: editTodoId, text: editTodoText });
    setEditTodoId(null);
    if (navigator.onLine && user) {
      await syncTodos(user);
    }
  };

  const handleCancelEdit = () => {
    setEditTodoId(null);
    setEditTodoText('');
  };

  const handleDeleteTodo = async (todoId) => {
    const filteredTodos = todos.filter(todo => todo.id !== todoId);
    setTodos(filteredTodos);
    await deleteTodoOffline(todoId);
    if (navigator.onLine && user) {
      await syncTodos(user);
    }
  };

  // const handleDeleteTodo = async (todoId) => {
  //   await collection.deleteOne({ _id: Realm.BSON.ObjectId(todoId) });
  //   await syncOfflineData(user);
  //   setTodos(todos.filter(todo => todo._id !== todoId));
  // };

  // async function deleteTodoFromDB(user, todoId) {
  //   const mongo = user.mongoClient('mongodb-atlas');
  //   const collection = mongo.db('todo-db').collection('todos');

  // }

  const login = async () => {
    const credentials = Realm.Credentials.emailPassword(email, password);
    try {
      const user = await app.logIn(credentials);
      setUser(user);
      setErrorMessage('');
      const fetchedTodos = await fetchTodosFromDB(user);
      setTodos(fetchedTodos);
    } catch (error) {
      console.error("Failed to log in", error);
      setErrorMessage('Failed to log in. Please check your credentials.');
    }
  };

  const register = async () => {
    try {
      await app.emailPasswordAuth.registerUser({ email, password });
      const credentials = Realm.Credentials.emailPassword(email, password);
      const user = await app.logIn(credentials);
      setUser(user);
      await saveUserData(user);
      setErrorMessage('');
      const fetchedTodos = await fetchTodosFromDB(user);
      setTodos(fetchedTodos);
    } catch (error) {
      if (error.error_code === 'AccountNameInUse') {
        setErrorMessage('Email is already in use. Please log in.');
      } else {
        console.error("Failed to register", error);
        setErrorMessage('Failed to register. Please try again.');
      }
    }
  };

  return (
    <div>
      <h1>Todo App</h1>
      {!user ? (
        <div>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
          />
          <button onClick={login}>Login</button>
          <button onClick={register}>Register</button>
          {errorMessage && <p style={{ color: 'red' }}>{errorMessage}</p>}
        </div>
      ) : (
        <div>
          <input
            value={todoText}
            onChange={(e) => setTodoText(e.target.value)}
            placeholder="Add a new todo"
          />
          <button onClick={handleAddTodo}>Add Todo</button>
          <ul>
            {todos.map(todo => (
              <li key={todo.id}>
                {editTodoId === todo.id ? (
                  <div>
                    <input
                      type="text"
                      value={editTodoText}
                      onChange={(e) => setEditTodoText(e.target.value)}
                    />
                    <button onClick={handleSaveEdit}>Save</button>
                    <button onClick={handleCancelEdit}>Cancel</button>
                  </div>
                ) : (
                  <div>
                    {todo.text}
                    <button onClick={() => handleEditButtonClick(todo.id, todo.text)}>Edit</button>
                    <button onClick={() => handleDeleteTodo(todo.id)}>Delete</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default App;
