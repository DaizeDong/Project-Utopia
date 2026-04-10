# **Assignment 2: Project Approval, Specification, and MVP Definition**

**Prerequisite:** Completion of Assignment 1 (Group Formation & Concept).

## **1\. Overview**

Now that you have formed a group and identified your core pillars, it is time to validate the feasibility of your project and map out exactly how you will build it. The goal of this assignment is to transition from a "cool idea" to a concrete engineering plan.

You will secure formal approval, be assigned a mentor, and produce three critical documents: a Product Requirement Document (PRD), a Technical Specification, and a definition of your Minimum Viable Product (MVP).

## **2\. Phase 1: Formal Approval & Mentor Assignment**

**This is a blocking requirement.** You cannot submit the final assignment documents until this step is complete.

Your team must initiate an email thread to secure approval for your chosen concept and pillars.

* **Recipients:** The Instructor, Danrui, and Sen.  
* **Subject Line:** \[CS 428/523\] Project Approval Request \- Group \[Your Group Name\]  
* **Content:**  
  * Brief Project Summary (2-3 sentences).  
  * The 2+ Pillars you have selected.  
  * A link to your Assignment 1 submission (or attachment).  
  * Ask for **Formal Approval** and **Mentor Assignment**.

Once approved, a Mentor will be assigned to your group to guide you through the semester. **You must submit a screenshot or PDF export of this approval email chain as part of your Assignment 2 deliverables.**

## **3\. Phase 2: The Product Requirement Document (PRD)**

The PRD describes **"What"** you are building and **"Why"** it matters. It focuses on the user experience and the functional goals.

Your PRD must include:

1. **Problem & Opportunity:** What visual or interactive problem are you solving? (e.g., "Current web-based fluid sims are slow," or "We want to visualize complex music data in real-time.")  
2. **Target Audience:** Who is this for? (e.g., Gamers, Digital Artists, Physics Students).  
3. **User Stories:** A list of specific interactions the user will have.  
   * *Format:* "As a![][image1]  
     , I want to![][image2]  
     so that![][image3]  
     ."  
   * *Example:* "As a player, I want to toggle gravity settings so I can see how the particle swarm reacts."  
4. **Key Features List:** Prioritize these using the **MoSCoW** method:  
   * **M**ust have (Critical for success).  
   * **S**hould have (Important but not vital).  
   * **C**ould have (Nice to have).  
   * **W**on't have (Out of scope for this semester).

## **4\. Phase 3: Technical Specification**

The Tech Spec describes **"How"** you will build it. This is where you prove you understand the engineering requirements of your chosen Pillars.

Your Tech Spec must include:

1. **The Tech Stack:**  
   * **Game Engine/Framework:** (e.g., Unity, Unreal, Godot, Three.js, WebGL, custom C++ OpenGL engine).  
   * **Programming Language:** (e.g., C\#, C++, JavaScript/TypeScript, Python).  
   * **External Libraries:** (e.g., Matter.js for physics, React for UI overlay).  
2. **AI Integration Strategy:**  
   * How will you use AI in the *development* or *runtime* of this project?  
   * **Development Workflow (Offline):**  
     * *Asset Creation:* Using tools like Stable Diffusion/Midjourney for textures, skyboxes, or UI elements.  
     * *3D Generation:* Using AI (e.g., TripoSR, Point-E) to generate rough 3D meshes or point clouds.  
     * *Coding Assistance:* Using Copilot/Cursor for code or ChatGPT/Claude to write complex GLSL/HLSL shaders.  
   * **Runtime Integration (Online):**  
     * *Dynamic Content:* Embedding lightweight models (e.g., TensorFlow.js) for style transfer or gesture recognition.  
     * *Logic:* Using LLM APIs (OpenAI/Gemini) for dynamic NPC dialogue or procedural storytelling.  
3. **Performance Constraints:**  
   * Target platform (Web browser, High-end PC, Mobile).  
   * Target frame rate (e.g., "Must maintain 60FPS with 5,000 particles").

## **5\. Phase 4: Defining the Narrow Vertical Slice (MVP)**

In graphics development, an MVP is often called a **"Vertical Slice."**

* **What it is NOT:** A rough, buggy version of the whole game.  
* **What it IS:** A polished, fully functional version of **just the core mechanic**.

**Requirement:** Define your MVP.

If your project is a "Solar System Explorer," your MVP might be: *"One single planet with a working atmospheric shader and functional gravity. No other planets, no spaceships, no UI—just the physics and rendering working perfectly."*

Your MVP definition must answer:

1. What is the *single* most technically difficult feature?  
2. How will you prove this feature works by the mid-term?  
3. What features are being explicitly cut from the MVP to ensure quality?

## **6\. (Optional but Recommended) Interactive Mockup**

Using the AI coding tools of your choice (Gemini, ChatGPT, Claude, etc.), generate a code-based mockup of your MVP.

* It does not need to use your final tech stack.  
* It serves as a "proof of logic."  
* *Example:* If building a C++ fluid sim, you might create a simple JavaScript canvas demo to test the math logic first.

## **7\. Deliverables & Submission Checklist**

**Submission Format:** Single PDF containing sections for PRD, Tech Spec, and MVP, plus the Email Proof attachment.

1. ![][image4]**Proof of Approval:** Screenshot/PDF of email thread with Instructor, Danrui, and Sen showing approval and Mentor assignment.  
2. ![][image4]**PRD:** User stories and MoSCoW feature list.  
3. ![][image4]**Technical Specification:** Engine, libraries, and AI tools defined.  
4. ![][image4]**MVP Definition:** Clear definition of your "Narrow Vertical Slice."  
5. ![][image4]**(Optional) Interactive Mockup:** Link to repo or hosted web demo.

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAmwAAAA/CAYAAABdEJRVAAADzUlEQVR4Xu3cP2jdVRQH8FdSQfHfoCE0ecnvvUc0tAgq2cRVRMTFRUVwdemsq4IOLg5FKHQRJx26CgodOomQxUUsQkGlCg5SEOpQ0XhO8rvpySWDONQEPh+4vHvOue/30u3L7/1eJxMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIC7ahiGm+vr60/0fQAAjokIbLuz2ezevg8AwDGRga3vAQAw2QtKZ2J90/fDqb6xvb19T56N9WE/S9E/G+t6rGe6/vXpdHrfuL8S68UyO7OxsfFGBrbc17ts0f+snk3z+XylzM/F+mIsl2L/U5x/r82r6F/Iz15bW3uknwEAHFsRYH6JgDSL1/dj/Vj6GZ5eqGcjDD0XvUu5XywWj8f+2zYbg1zeIVvKOi75apxf5H7st2teb2dj/nZ7f9S/xbrc6na+vqYMc1lH6JpGeSr2L0fvk3j9O9bZPBPB8LGs23vGELfT6th/3fYAAMdeC00ZgiL4vNP6NSTVXvtRQOy/i/PPHzUb6yuT8Q5d7M+vrq4+2q45Br/dDG7l/G69c5bBLM5tx/Z0/VuG/WDZgtyn4+ut4XDYyyDXPuti/2+J+q9aAwCcCDXUZHDqQ06K3q/ZH9dXrR/h6s3Sz3V7Mt5payI4fRz9P2uvOurzUn7dGbObrR6vf6Geyd50Ol1rdbzn2Xa97u/Ku3pv3XknAMAJEUHm9RqYYn851q16plleXn4gZtfyfO6zF/ur9f1HyXkGu76f+s+vxpCVd9oO6q2trQf7M139Q+vla71zBwBwIo2B62qp98JVfo2Zq/X6M2WfD/P/0epmsVg83Pbj+dNlfCBmv8f6PPf5demknKufs7Kycn+tx3kfNudZR0gbxjpn/Y8n+hoA4Hgbv668MZZ7z38N+78c/aidyd74oP9B3fYZzI4IUjv9M2p1XuUs/oaX2r6fTe48C5e/Lu3nO7U37D/PVutDz9aFpcEzbADASZQhJsPNbDZ7N9ZTuY91vs0jUJ0be7l+ru9N0Xu6zK/V2Xw+fzKvX3tVC3zD/rNvh8TfMivXvTGUu3wp++2ZtVybm5sP1fl45na5xryfAwDwH0VWey3WK63OwNX+L7faqzUAAHfRePfsYu4juH0/7P9XIQfqr0EBAPgfREj7oH2VOZ/Pt+oswtqX5WtOoQ0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPi3/gFYDQNonXKTyAAAAABJRU5ErkJggg==>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAmwAAAA/CAYAAABdEJRVAAAC40lEQVR4Xu3cMWgUQRQAUINaWGkUlHCbu81Fi9iInAiCdhaKna2lhY2doCA2thYWgp0gVjZ2EhCxSBmwVbARDAgpJIVCGiHGP2HmHNdoJUG89+Az8//83bvys8nerl0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB/Vdu2LweDwfVuPWpLEZvdOgAAOywNZREL3ToAAP8IT9EAAHZADF332ra9263Xoud+xHJsp3I+Mzc3dyI/YZuJ6w9UvTf+dL84f1jfK9cuRbwvtdhfjXgX292lBwBg4jRNc7B+QpaHr7d1T+R3IjbSvtfrNaknBrUj+WwxYrXT/yavm/1+f1SfRf446p9KnnrinodSxHc5GvlM/g7rdU/ZAwBMnDQMxaC0r85jqDpb8hjMTtcDU+yXB3l4y3kari6WPK49n4aychbLnqp3ozt8Rb4SsTrIQ2KsV7bpMbABAJMpBqGn3WFouzxiqa7Vuv1F27YX6rPhcLg/5WWYK6L2bfDz07QvEc9Knp7Q/e4zAAD+e3kY+1jlC93hKA9Zw7pWpHq3v8j3Hv/UR/Teyvea7vbFcHct90ynvGmaXnW+HrH44woAgAmSh6rbVf464kM5q9da1E7GMhXrq4i1VJufnz8c+7mqp1z/IK+Xu/eanZ09V9di/6jbk/P0WWcG1ZM3AICJ0O/3X1RDUBqKNtOA1TTNsXSWiqmW8uqy1Lf1P2yxrrRt+yTv6z9rbr04kPdlANu6f3lZoZzF0Haqyteq/nFPXtfTiwn1GQDARIhB6HMaimJAuzkajfam/SC/5Vn1pNpWRN/x6qgMeds9hfulXt4wzTF+caHI9eed2td8n/HPfwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABMlu/gCrZXhZDZegAAAABJRU5ErkJggg==>

[image3]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAmwAAAA/CAYAAABdEJRVAAADeUlEQVR4Xu3dv4sdVRQH8F1cQRHxJ1nc92bfe/uKRRAstrCyUzCINmIl2FoKWljaW4j/gVoEGzsRUlgIlmlSGLAJBAmIiCwKCkbM85zdufFyXFE0suvz84Gbmfs99w5THubNTjY2AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4N+yu7v7xmw2W+WotdNycHBw53hPP06n07trHQDgfycao5fOUsOW97Kzs/NwHqOhPOhrrcHssxTZ4TAMj9UcAGAtRLPzbYyPa35aTmrI/kzumc/nd9UcAGAtjE+ynqr5aYj7eODvNmw1AwBYG63ZieMX0TC9V8pHovZW1L5cLpdDy+bz+RORf9jmUX8x5lfzHbSWFZux5/1Yc6EWUuSPxDXezPvJ88lk8lCpP9vfX1zr/nHPy22Pp2wAwNqJJufRbHay6cl5e+G/q1/KRq2bfxCHrVw3DMOTMf80xuVY82q3pj7t2ozslxhvtyDOf+4XNJFfj/FZzaMRe2fj+DrX8z22vjY7/kn3VuMIALBWsjmK8VXJ2hO312vzFfPD8Xj0zls2XjE+L2vqnlWMm20+NoUf9Wuace35E/Jr4zHri1JbLRaL7T4DAFgb2ewMw/B8m7e/zmy1Mr7+beexzPO9szafTqeTtj/lu3H1OpE91+rVuHer5imbsv7azUkZAMDaqM1ONFPvtiyP0SQ93teLrbo/5tdiXGnz8Z21v9pQ/e56vagdxv1dLNmZ+iQJAMBtV5qdo4Ypxguttr+/f29Xbzbzn6i/VpulnOfHbuO4yCdv0bC9UtekzGsW686ftLYZa5v51C6PY/b9bPx5NvKnN/7g6RwAwH9W3yDF+aUy/ykaq2fafMx+6M6v5J5Sb0/nro7RURPY/48Fcf5gZJ+0eRPZhWzAat501+7v4dZPrP29AwCskzuy0cmRn+moxci/a/VZ+bhuZsvl8lzJvsm8/7RHXHfeXWO1vb19T7+nidrN+hegvajfyP0b49O1tLe3d9943RvdUgAAbqf27bTajAEAcAbMjr/jtppMJtOxYQMA4CxZLBaz9lNprQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPxDvwKwxNu4m6+9TgAAAABJRU5ErkJggg==>

[image4]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAmwAAAAbCAYAAADBLdN1AAAAWElEQVR4Xu3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAwMFugAB7qYxEgAAAABJRU5ErkJggg==>