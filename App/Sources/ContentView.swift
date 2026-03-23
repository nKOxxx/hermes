import SwiftUI

// MARK: - Models

struct Agent: Identifiable, Codable {
    let id: String
    var name: String
    var task: String
    var status: AgentStatus
    var pid: Int?
    var startedAt: Date?
    var completedAt: Date?
    var logPath: String?
    
    enum AgentStatus: String, Codable {
        case pending, running, completed, failed
    }
}

struct AppState: ObservableObject {
    @Published var agents: [Agent] = []
    @Published var newTaskName: String = ""
    @Published var workspacePath: String = ""
    @Published var isSpawning: Bool = false
    @Published var logOutput: String = ""
    
    let agentsDir: URL
    let resultsDir: URL
    
    init() {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let aresDir = appSupport.appendingPathComponent("ares-agent", isDirectory: true)
        
        agentsDir = aresDir.appendingPathComponent("agents", isDirectory: true)
        resultsDir = aresDir.appendingPathComponent("results", isDirectory: true)
        
        // Create directories
        try? FileManager.default.createDirectory(at: agentsDir, withIntermediateDirectories: true)
        try? FileManager.default.createDirectory(at: resultsDir, withIntermediateDirectories: true)
        
        // Default workspace
        workspacePath = NSHomeDirectory() + "/Projects"
        
        loadAgents()
    }
    
    func loadAgents() {
        guard let contents = try? FileManager.default.contentsOfDirectory(at: agentsDir, includingPropertiesForKeys: nil) else { return }
        
        agents = contents.compactMap { url -> Agent? in
            guard url.hasDirectoryPath else { return nil }
            let name = url.lastPathComponent
            let metaPath = url.appendingPathComponent(".agent-meta")
            
            var agent = Agent(
                id: name,
                name: name,
                task: "Unknown task",
                status: .pending,
                pid: nil,
                startedAt: nil,
                completedAt: nil,
                logPath: url.appendingPathComponent("agent.log").path
            )
            
            // Load meta if exists
            if let meta = try? String(contentsOf: metaPath, encoding: .utf8) {
                let lines = meta.components(separatedBy: "\n")
                for line in lines {
                    let parts = line.split(separator: ":", maxSplits: 1).map(String.init)
                    if parts.count == 2 {
                        switch parts[0] {
                        case "task": agent.task = parts[1]
                        case "status": agent.status = Agent.AgentStatus(rawValue: parts[1]) ?? .pending
                        case "pid": agent.pid = Int(parts[1])
                        case "started": agent.startedAt = ISO8601DateFormatter().date(from: parts[1])
                        case "completed": agent.completedAt = ISO8601DateFormatter().date(from: parts[1])
                        default: break
                        }
                    }
                }
            }
            
            return agent
        }
    }
    
    func spawnAgent(task: String) {
        let agentId = UUID().uuidString.prefix(8).description
        let agent = Agent(
            id: agentId,
            name: "agent-\(agentId)",
            task: task,
            status: .running,
            pid: nil,
            startedAt: Date(),
            completedAt: nil,
            logPath: nil
        )
        
        agents.append(agent)
        saveAgent(agent)
        
        // Launch agent in background
        DispatchQueue.global().async {
            self.launchAgent(agent, task: task)
        }
    }
    
    func launchAgent(_ agent: Agent, task: String) {
        let agentDir = agentsDir.appendingPathComponent(agent.name, isDirectory: true)
        try? FileManager.default.createDirectory(at: agentDir, withIntermediateDirectories: true)
        
        // Save task
        let taskFile = agentDir.appendingPathComponent(".agent-task")
        try? task.data(using: .utf8)?.write(to: taskFile)
        
        // Save meta
        saveMeta(for: agent)
        
        // Create result placeholder
        let resultsDir = agentDir.appendingPathComponent("results")
        try? FileManager.default.createDirectory(at: resultsDir, withIntermediateDirectories: true)
        
        DispatchQueue.main.async {
            self.updateAgent(agent.id, status: .running)
        }
        
        // Simulate agent work - in real impl, this spawns OpenClaw
        DispatchQueue.global().asyncAfter(deadline: .now() + 2) {
            DispatchQueue.main.async {
                self.updateAgent(agent.id, status: .completed)
            }
        }
    }
    
    func saveMeta(for agent: Agent) {
        let agentDir = agentsDir.appendingPathComponent(agent.name, isDirectory: true)
        let metaFile = agentDir.appendingPathComponent(".agent-meta")
        
        var meta = "task:\(agent.task)\n"
        meta += "status:\(agent.status.rawValue)\n"
        if let pid = agent.pid { meta += "pid:\(pid)\n" }
        if let started = agent.startedAt {
            meta += "started:\(ISO8601DateFormatter().string(from: started))\n"
        }
        
        try? meta.write(to: metaFile, atomically: true, encoding: .utf8)
    }
    
    func updateAgent(_ id: String, status: Agent.AgentStatus) {
        if let index = agents.firstIndex(where: { $0.id == id }) {
            agents[index].status = status
            if status == .completed {
                agents[index].completedAt = Date()
            }
            saveMeta(for: agents[index])
        }
    }
    
    func removeAgent(_ agent: Agent) {
        let agentDir = agentsDir.appendingPathComponent(agent.name, isDirectory: true)
        try? FileManager.default.removeItem(at: agentDir)
        agents.removeAll { $0.id == agent.id }
    }
    
    func removeAllAgents() {
        for agent in agents {
            removeAgent(agent)
        }
    }
}

// MARK: - ContentView

struct ContentView: View {
    @StateObject var state = AppState()
    @State private var showNewTaskSheet = false
    @State private var newTaskName = ""
    @State private var showSettings = false
    
    var body: some View {
        VStack(spacing: 0) {
            // Header
            headerView
            
            Divider()
            
            // Main content
            if state.agents.isEmpty {
                emptyStateView
            } else {
                agentListView
            }
        }
        .frame(minWidth: 700, minHeight: 500)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button(action: { showNewTaskSheet = true }) {
                    Label("New Agent", systemImage: "plus.circle")
                }
            }
            ToolbarItem(placement: .secondaryAction) {
                Button(action: { showSettings = true }) {
                    Label("Settings", systemImage: "gear")
                }
            }
        }
        .sheet(isPresented: $showNewTaskSheet) {
            newTaskSheet
        }
        .sheet(isPresented: $showSettings) {
            settingsSheet
        }
    }
    
    // MARK: - Header
    
    var headerView: some View {
        HStack {
            Image(systemName: "bolt.circle.fill")
                .font(.system(size: 32))
                .foregroundStyle(.yellow)
            
            VStack(alignment: .leading) {
                Text("ARES Agent")
                    .font(.title2.bold())
                Text("\(state.agents.count) agent\(state.agents.count == 1 ? "" : "s")")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            
            Spacer()
            
            Button(action: { state.loadAgents() }) {
                Image(systemName: "arrow.clockwise")
            }
            .help("Refresh")
        }
        .padding()
        .background(Color(nsColor: .windowBackgroundColor))
    }
    
    // MARK: - Empty State
    
    var emptyStateView: some View {
        VStack(spacing: 20) {
            Spacer()
            
            Image(systemName: "cpu")
                .font(.system(size: 64))
                .foregroundStyle(.secondary)
            
            Text("No Agents Running")
                .font(.title2.bold())
            
            Text("Spawn agents to work on your tasks in parallel")
                .foregroundStyle(.secondary)
            
            Button(action: { showNewTaskSheet = true }) {
                Label("Spawn Agent", systemImage: "plus")
            }
            .buttonStyle(.borderedProminent)
            
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    
    // MARK: - Agent List
    
    var agentListView: some View {
        List {
            ForEach(state.agents) { agent in
                AgentRow(agent: agent, onRemove: { state.removeAgent(agent) })
            }
        }
        .listStyle(.inset(alternatesRowBackgrounds: true))
    }
    
    // MARK: - New Task Sheet
    
    var newTaskSheet: some View {
        VStack(spacing: 20) {
            Text("Spawn New Agent")
                .font(.headline)
            
            TextField("Task description", text: $newTaskName, axis: .vertical)
                .textFieldStyle(.roundedBorder)
                .frame(minHeight: 100)
            
            HStack {
                Button("Cancel") {
                    showNewTaskSheet = false
                    newTaskName = ""
                }
                .keyboardShortcut(.cancelAction)
                
                Spacer()
                
                Button("Spawn") {
                    state.spawnAgent(task: newTaskName)
                    showNewTaskSheet = false
                    newTaskName = ""
                }
                .keyboardShortcut(.defaultAction)
                .buttonStyle(.borderedProminent)
                .disabled(newTaskName.isEmpty)
            }
        }
        .padding(30)
        .frame(width: 500)
    }
    
    // MARK: - Settings Sheet
    
    var settingsSheet: some View {
        VStack(spacing: 20) {
            Text("Settings")
                .font(.headline)
            
            HStack {
                Text("Workspace:")
                TextField("Path", text: $state.workspacePath)
                    .textFieldStyle(.roundedBorder)
            }
            
            Button("Close") {
                showSettings = false
            }
        }
        .padding(30)
        .frame(width: 400)
    }
}

// MARK: - Agent Row

struct AgentRow: View {
    let agent: Agent
    let onRemove: () -> Void
    
    var statusColor: Color {
        switch agent.status {
        case .pending: return .gray
        case .running: return .orange
        case .completed: return .green
        case .failed: return .red
        }
    }
    
    var body: some View {
        HStack(spacing: 12) {
            // Status indicator
            Circle()
                .fill(statusColor)
                .frame(width: 10, height: 10)
            
            // Agent info
            VStack(alignment: .leading, spacing: 4) {
                Text(agent.name)
                    .font(.headline)
                
                Text(agent.task)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            
            Spacer()
            
            // Status
            Text(agent.status.rawValue.capitalized)
                .font(.caption)
                .foregroundStyle(statusColor)
            
            // Time
            if let started = agent.startedAt {
                Text(started, style: .relative)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            
            // Remove button
            Button(action: onRemove) {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 8)
    }
}

// MARK: - Preview

#Preview {
    ContentView()
}
