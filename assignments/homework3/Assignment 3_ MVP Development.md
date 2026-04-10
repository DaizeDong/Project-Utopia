# **Assignment 3: MVP Implementation & Demo**

**Prerequisite:** Assignment 2 (Specs & MVP Definition) completed and approved.

## **1\. Overview**

In Assignment 2, you defined your "Narrow Vertical Slice"—the single most technically challenging aspect of your project. The goal of Assignment 3 is to build it.

By the deadline, you must have a functional, running prototype that demonstrates your core graphics pillars. This is not the final polished game, but it is the proof that your engineering approach works.

**Crucial Rule:** If your MVP definition in Assignment 2 was "A functional fluid simulation," and you submit a project with great UI but *no* fluid simulation, you will fail this assignment. Focus entirely on the core technical challenge.

## **2\. Phase 1: Development & AI Integration**

Implement the features defined in your Technical Specification.

### **Core Graphics Implementation**

* Initialize your Game Engine/Framework.  
* Implement the core algorithms (e.g., the Boids algorithm, the shader code, or the physics integration).  
* Ensure the project runs at the target frame rate defined in your specs.

### **AI Integration Checkpoint**

* **Offline AI:** If you proposed using AI for assets (textures, meshes), those assets must be present in this build.  
* **Runtime AI:** If you proposed using AI for logic (LLMs, dynamic pathfinding), the API calls must be functional, even if the behavior is basic.

## **3\. Phase 2: The Demo Video**

**Video Requirements (Duration: 2-3 minutes):**

1. **Visual Proof:** Screen capture of the software running in real-time.  
2. **Feature Walkthrough:** Voiceover or text overlay explaining exactly what is happening on screen (e.g., *"Here you can see the shader reacting to the light source..."*).  
3. **Stress Test:** Show the limits of your MVP (e.g., spawn max particles until FPS drops) to demonstrate performance characteristics.

## **4\. Phase 3: The Midterm Report (Post-Mortem)**

Write a brief report (1-2 pages) analyzing your progress.

1. **Plan vs. Reality:**  
   * What features from your Assignment 2 MVP definition made it in?  
   * What features had to be cut or changed?  
2. **AI Utility:**  
   * How useful were the AI tools you listed in your Tech Spec?  
   * Did they save time, or did debugging them take longer than expected?  
3. **Roadmap to Final:**  
   * What is left to build for the final submission?

## **5\. Deliverables & Submission Checklist**

**Submission Format:**

* **PDF Report** containing links to the Code, Build, and Video.  
* **Zip file** of the build (if under 500MB) OR a link to a drive/itch.io upload.

### **Checklist:**

1. \[ \] **Source Code:** Link to a public GitHub repository.  
   * *Must include a README.md with build instructions.*  
2. \[ \] **Playable Build / Web Link:**  
   * For WebGL: A live URL (GitHub Pages, Vercel, etc.).  
   * For Desktop: A compiled executable (.exe, .app) or strict instructions on how to run.  
3. \[ \] **Demo Video:** YouTube or Vimeo link.  
4. \[ \] **Midterm Report:** 1-2 page PDF covering the "Plan vs. Reality" reflection.